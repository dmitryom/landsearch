from __future__ import annotations

import csv
import logging
import os
import statistics
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

LAND_REAL_ESTATE_TYPE_CODE = "002001001000"
RUBLE_NAMES = {"рубль", "руб.", "rur", "rub", ""}
OUTLIER_MIN_UNIT_PRICE = 100.0

MIN_DEALS_QUARTER = 2
MIN_DEALS_DISTRICT = 3
MIN_DEALS_REGION = 5

PERMIT_TYPE_TO_PURPOSE_PREFIX: dict[str, str] = {
    "ИЖС": "142001",
    "ЖИЛОЙ": "142001",
    "ЛПХ": "141003",
    "СНТ": "141004",
    "ДНП": "141006",
    "ОГП": "142002",
    "КОМ": "142002",
    "ПРОМ": "142003",
    "СХ": "141001",
    "ОТДЫХ": "142005",
    "ТРАНСПОРТ": "142007",
}

PURPOSE_PREFIX_LABELS: dict[str, str] = {
    "142001": "жилая (ИЖС)",
    "142002": "общественно-деловая",
    "142003": "промышленная",
    "142005": "рекреационная",
    "142007": "транспорт",
    "141001": "СХ производство",
    "141003": "ЛПХ",
    "141004": "садоводство (СНТ)",
    "141006": "дачное (ДНП)",
}


@dataclass(frozen=True)
class MarketStats:
    unit_price: float
    deals_count: int
    period: str | None
    scope: str


class RosreestrDealsMarketEstimator:
    def __init__(
        self,
        dataset: str | Path | None = None,
        cache_dir: str | Path | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.dataset = dataset
        self.cache_dir = Path(cache_dir) if cache_dir else self._default_cache_dir()
        self.timeout = timeout

    def estimate(self, cad_unit: str, permit_type: str | None = None) -> MarketStats | None:
        quarter = cad_unit.strip()
        if not quarter:
            return None
        district = ":".join(quarter.split(":")[:2])
        region = quarter.split(":", 1)[0]
        purpose_prefix = PERMIT_TYPE_TO_PURPOSE_PREFIX.get(permit_type or "")

        try:
            dataset_path = self._resolve_dataset_path()
        except Exception as e:
            logger.warning("Cannot resolve Rosreestr dataset: %s", e)
            return None

        deals: dict[tuple, list[float]] = defaultdict(list)
        periods: dict[tuple, str | None] = {}

        for row in self._iter_rows(dataset_path):
            if (row.get("realestate_type_code") or "") != LAND_REAL_ESTATE_TYPE_CODE:
                continue
            if not self._is_ruble(row.get("currency")):
                continue

            row_region = row.get("region_code") or ""
            if row_region != region:
                continue

            row_quarter = row.get("quarter_cad_number") or ""
            row_district = (
                ":".join(row_quarter.split(":")[:2]) if row_quarter.count(":") >= 1 else ""
            )
            area = self._to_float(row.get("area"))
            price = self._to_float(row.get("deal_price"))
            if area is None or price is None or area <= 0 or price <= 0:
                continue

            unit_price = price / area
            if unit_price < OUTLIER_MIN_UNIT_PRICE:
                continue

            period = row.get("period_start_date") or None
            row_purpose = (row.get("purpose_code") or "").strip()
            row_purpose_prefix = row_purpose[:6] if len(row_purpose) >= 6 else None

            purp_targets = (
                (row_purpose_prefix, None)
                if row_purpose_prefix is not None
                else (None,)
            )
            for purp in purp_targets:
                if row_quarter and row_district in (district,):
                    deals[("quarter", row_quarter, purp)].append(unit_price)
                    self._update_period(periods, ("quarter", row_quarter, purp), period)
                if row_district:
                    deals[("district", row_district, purp)].append(unit_price)
                    self._update_period(periods, ("district", row_district, purp), period)
                deals[("region", row_region, purp)].append(unit_price)
                self._update_period(periods, ("region", row_region, purp), period)

        return self._pick_stats(deals, periods, quarter, district, region, purpose_prefix)

    def _pick_stats(
        self,
        deals: dict,
        periods: dict,
        quarter: str,
        district: str,
        region: str,
        purpose_prefix: str | None,
    ) -> MarketStats | None:
        candidates = self._tier_candidates(quarter, district, region, purpose_prefix)
        return self._walk_tiers(deals, periods, candidates)

    def _walk_tiers(
        self,
        deals: dict,
        periods: dict,
        candidates: list[tuple[tuple, int, str]],
    ) -> MarketStats | None:
        for key, min_deals, scope in candidates:
            values = deals.get(key)
            if not values or len(values) < min_deals:
                continue
            return MarketStats(
                unit_price=statistics.median(values),
                deals_count=len(values),
                period=periods.get(key),
                scope=scope,
            )
        return None

    def _tier_candidates(
        self,
        quarter: str,
        district: str,
        region: str,
        purpose_prefix: str | None,
    ) -> list[tuple[tuple, int, str]]:
        purpose_label = (
            PURPOSE_PREFIX_LABELS.get(purpose_prefix) if purpose_prefix else None
        )
        candidates: list[tuple[tuple, int, str]] = []
        if purpose_prefix:
            candidates.extend([
                (("quarter", quarter, purpose_prefix), MIN_DEALS_QUARTER,
                 f"квартал {quarter} ({purpose_label})"),
                (("district", district, purpose_prefix), MIN_DEALS_DISTRICT,
                 f"район {district} ({purpose_label})"),
            ])
        candidates.extend([
            (("quarter", quarter, None), MIN_DEALS_QUARTER, f"квартал {quarter}"),
            (("district", district, None), MIN_DEALS_DISTRICT, f"район {district}"),
        ])
        if purpose_prefix:
            candidates.append(
                (("region", region, purpose_prefix), MIN_DEALS_REGION,
                 f"регион {region} ({purpose_label})")
            )
        candidates.append(
            (("region", region, None), MIN_DEALS_REGION, f"регион {region}")
        )
        return candidates

    def _resolve_dataset_path(self) -> Path:
        dataset = self.dataset or os.getenv("LANDSEARCH_ROSREESTR_DATASET")
        if dataset:
            dataset_str = str(dataset)
            if dataset_str.startswith(("http://", "https://")):
                return self._download_dataset(dataset_str)
            return Path(dataset_str).expanduser()
        dataset_url = os.getenv("LANDSEARCH_ROSREESTR_URL") or self._discover_latest_url()
        return self._download_dataset(dataset_url)

    def _download_dataset(self, url: str) -> Path:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        from urllib.parse import urlparse
        name = Path(urlparse(url).path).name or "rosreestr_deals.csv.zip"
        path = self.cache_dir / name
        if path.exists() and path.stat().st_size > 0:
            return path
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                with tmp_path.open("wb") as f:
                    for chunk in response.iter_bytes():
                        f.write(chunk)
        tmp_path.replace(path)
        return path

    def _discover_latest_url(self) -> str:
        return os.getenv(
            "LANDSEARCH_ROSREESTR_URL",
            "https://rosreestr.gov.ru/data-sets/"
            "1%20%EA%E2%E0%F0%F2%E0%EB%202026%E3./"
            "dataset_%D1%C4%C5%CB%CA%C8_r-r_01-92_y_2026_q_1.csv.zip",
        )

    def _iter_rows(self, dataset_path: Path):
        if dataset_path.suffix.lower() == ".zip":
            with zipfile.ZipFile(dataset_path) as archive:
                csv_name = next(n for n in archive.namelist() if n.endswith(".csv"))
                with archive.open(csv_name) as f:
                    text = (line.decode("utf-8-sig") for line in f)
                    yield from csv.DictReader(text, delimiter="~")
            return
        with dataset_path.open("r", encoding="utf-8-sig", newline="") as f:
            yield from csv.DictReader(f, delimiter="~")

    def _is_ruble(self, currency: str | None) -> bool:
        return (currency or "").strip().lower() in RUBLE_NAMES

    def _to_float(self, value: str | None) -> float | None:
        if value in (None, ""):
            return None
        try:
            return float(str(value).replace(",", "."))
        except ValueError:
            return None

    def _update_period(self, periods: dict, key: tuple, period: str | None) -> None:
        current = periods.get(key)
        if not period:
            return
        if not current or period > current:
            periods[key] = period

    def _default_cache_dir(self) -> Path:
        return Path("/tmp/landsearch/rosreestr-deals")
