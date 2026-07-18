import asyncio
import logging
import math
import random
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from geoalchemy2.shape import from_shape
from fastapi.encoders import jsonable_encoder
from shapely.geometry import mapping
from shapely.validation import make_valid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CadastreCache, Plot, PlotStatus
from .boundary_coverage import shape_is_covered_by_majority

logger = logging.getLogger(__name__)

_NSPD_AVAILABLE = False
Nspd = None
try:
    from pynspd import Nspd
    from pynspd.schemas.feature import NspdFeature
    _NSPD_AVAILABLE = True
except ImportError:
    logger.warning("pynspd not available, cadastre enrichment disabled")

# Retry / block-guard config
_BASE_COOLDOWN = 8.0
_MAX_COOLDOWN = 90.0
_DEFAULT_ATTEMPTS = 4

# NSPD is authoritative for cadastral attributes. Commercial listing fields
# such as price, sale status, title and description stay tenant-managed.
_NSPD_FIELD_MAP = {
    "cadastral_number": "cad_num",
    "address": "address",
    "area_m2": "area_m2",
    "category": "category",
    "permitted_use": "permitted_use",
    "cadastral_value": "cost_value",
    "cad_unit": "cad_unit",
    "cad_status": "cad_status",
    "object_type": "object_type",
    "land_plot_type": "land_plot_type",
    "registration_date": "registration_date",
    "ownership_form": "ownership_form",
}

_cooldown = 0.0
_cooldown_until = 0.0


@dataclass(frozen=True)
class NspdWmsLayer:
    layer_id: int
    title: str
    geometry_type: str = "Polygon"


# These are the official NSPD polygon layers used by the regional cadastral
# overlay. They are intentionally separate from tenant-owned Plot records.
NSPD_WMS_LAYERS = {
    36048: NspdWmsLayer(36048, "Земельные участки ЕГРН"),
    36049: NspdWmsLayer(36049, "Здания ЕГРН"),
    36328: NspdWmsLayer(36328, "Сооружения ЕГРН"),
    36329: NspdWmsLayer(36329, "Объекты незавершённого строительства ЕГРН"),
}


def _wait_cooldown() -> None:
    global _cooldown_until
    delay = _cooldown_until - time.monotonic()
    if delay > 0:
        time.sleep(delay)


def _register_block() -> None:
    global _cooldown, _cooldown_until
    _cooldown = min(_MAX_COOLDOWN, max(_BASE_COOLDOWN, _cooldown * 1.7))
    jitter = _cooldown * random.uniform(0.0, 0.3)
    _cooldown_until = time.monotonic() + _cooldown + jitter


def _register_success() -> None:
    global _cooldown, _cooldown_until
    _cooldown *= 0.5
    if _cooldown < 0.5:
        _cooldown = 0.0
    _cooldown_until = 0.0


def _tile_bbox_web_mercator(z: int, x: int, y: int) -> str:
    """Return a Web Mercator bbox for an XYZ tile without extra GIS deps."""
    if z < 0 or z > 22:
        raise ValueError("Invalid tile zoom")
    limit = 2**z
    if x < 0 or y < 0 or x >= limit or y >= limit:
        raise ValueError("Invalid tile coordinates")

    earth_radius = 6378137.0
    world_extent = math.pi * earth_radius

    def project(lon: float, lat: float) -> tuple[float, float]:
        x_m = math.radians(lon) * earth_radius
        y_m = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * earth_radius
        return x_m, y_m

    n = float(limit)
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    min_x, min_y = project(west, south)
    max_x, max_y = project(east, north)
    min_x = max(-world_extent, min(world_extent, min_x))
    min_y = max(-world_extent, min(world_extent, min_y))
    max_x = max(-world_extent, min(world_extent, max_x))
    max_y = max(-world_extent, min(world_extent, max_y))
    return ",".join(f"{value:.6f}" for value in (min_x, min_y, max_x, max_y))


def fetch_nspd_wms_tile(layer_id: int, z: int, x: int, y: int, tile_size: int = 256) -> bytes:
    """Fetch one authoritative NSPD polygon tile as a transparent PNG."""
    if layer_id not in NSPD_WMS_LAYERS:
        raise ValueError(f"Unsupported NSPD layer: {layer_id}")
    if not _NSPD_AVAILABLE or Nspd is None:
        raise RuntimeError("pynspd is not available")

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "STYLES": "",
        "LAYERS": str(layer_id),
        "CRS": "EPSG:3857",
        "BBOX": _tile_bbox_web_mercator(z, x, y),
        "WIDTH": tile_size,
        "HEIGHT": tile_size,
    }
    with Nspd(client_timeout=30, client_retries=2) as nspd:
        response = nspd.safe_request("get", f"/api/aeggis/v3/{layer_id}/wms", params=params)
    content_type = str(getattr(response, "headers", {}).get("content-type", "image/png")).lower()
    if "image/png" not in content_type:
        raise RuntimeError(f"NSPD returned unexpected content type: {content_type}")
    return response.content


def _find_with_retry(cn: str, attempts: int = _DEFAULT_ATTEMPTS) -> NspdFeature | None:
    """Find a cadastral object by number with retry and block-guard."""
    if not _NSPD_AVAILABLE:
        return None

    for attempt in range(attempts):
        _wait_cooldown()
        try:
            with Nspd(client_timeout=30, client_retries=0) as nspd:
                feat = nspd.find(cn)
            _register_success()
            return feat
        except Exception as e:
            text = str(e)
            blocked = "Доступ заблокирован" in text or "403" in text or "429" in text
            if blocked:
                _register_block()
            if attempt < attempts - 1:
                base = _BASE_COOLDOWN if blocked else 2.0
                wait_s = min(_MAX_COOLDOWN, base * (1.6 ** attempt))
                wait_s += random.uniform(0.0, wait_s * 0.3)
                logger.debug(
                    "NSPD find %s attempt %d/%d failed (%s%s); retry in %.1fs",
                    cn, attempt + 1, attempts, type(e).__name__,
                    " BLOCKED" if blocked else "", wait_s,
                )
                time.sleep(wait_s)
            else:
                logger.warning("NSPD find %s failed after %d attempts: %s", cn, attempts, e)
    return None


def _extract_feature_data(feat: NspdFeature) -> dict[str, Any] | None:
    """Extract flat dict from NspdFeature.options."""
    props = feat.properties.options
    data: dict[str, Any] = {}

    data["cad_num"] = getattr(props, "cad_num", None)
    data["address"] = getattr(props, "readable_address", None)
    data["area_m2"] = getattr(props, "specified_area", None)
    data["category"] = getattr(props, "land_record_category_type", None)
    data["cad_status"] = getattr(props, "status", None)
    data["cad_unit"] = getattr(props, "quarter_cad_number", None)
    data["cost_value"] = getattr(props, "cost_value", None)
    data["cost_index"] = getattr(props, "cost_index", None)
    data["ownership_type"] = getattr(props, "ownership_type", None)
    data["object_type"] = getattr(props, "land_record_type", None)
    data["land_plot_type"] = getattr(props, "land_record_subtype", None)
    data["ownership_form"] = getattr(props, "ownership_type", None)

    # Permitted use: prefer document-based, fallback to record type
    permitted = getattr(props, "permitted_use_established_by_document", None)
    if not permitted or not permitted.strip():
        permitted = getattr(props, "land_record_type", None)
    data["permitted_use"] = permitted.strip() if permitted and permitted.strip() else None

    # Date registered
    raw_date = getattr(props, "land_record_reg_date", None)
    if raw_date is not None:
        try:
            data["date_created"] = raw_date.date() if hasattr(raw_date, "date") else raw_date
        except Exception:
            data["date_created"] = None
    else:
        data["date_created"] = None

    # Registration date as string (for display)
    reg_date = getattr(props, "registration_date", None)
    if reg_date is not None:
        data["registration_date"] = str(reg_date)
    else:
        data["registration_date"] = None

    return data


def _extract_feature_shape(feat: NspdFeature) -> Any | None:
    """Extract a Shapely geometry from an NSPD feature."""
    try:
        geom = getattr(feat, "geometry", None)
        if geom is None:
            return None
        return geom.to_shape()
    except Exception as e:
        logger.debug("Geometry extraction failed: %s", e)
        return None


def _extract_geometry(feat: NspdFeature) -> Any | None:
    """Extract PostGIS geometry from NspdFeature via shapely."""
    shp = _extract_feature_shape(feat)
    return from_shape(shp, srid=4326) if shp is not None else None


def _extract_geometry_geojson(feat: NspdFeature) -> dict | None:
    """Extract GeoJSON dict from NspdFeature."""
    try:
        geom = getattr(feat, "geometry", None)
        if geom is None:
            return None
        return mapping(geom.to_shape())
    except Exception:
        return None


def _centroid(feat: NspdFeature) -> tuple[float | None, float | None]:
    """Extract centroid (lat, lon) from feature geometry."""
    try:
        geom = getattr(feat, "geometry", None)
        if geom is None:
            return None, None
        shp = geom.to_shape()
        c = shp.centroid
        return c.y, c.x
    except Exception:
        return None, None


def _is_blocked(exc: BaseException) -> bool:
    if type(exc).__name__ in ("BlockedIP", "TooManyRequests"):
        return True
    text = str(exc)
    return "Доступ заблокирован" in text or "403" in text or "429" in text


def _is_not_found(exc: BaseException) -> bool:
    return type(exc).__name__ == "NotFound"


async def enrich_from_cadastre(session: AsyncSession, plot: Plot) -> bool:
    """Enrich a single plot with data from NSPD/Rosreestr."""
    if not _NSPD_AVAILABLE:
        return False

    cn = plot.cadastral_number.strip()

    # Check cache first
    cached = await session.execute(
        select(CadastreCache).where(CadastreCache.cadastral_number == cn)
    )
    existing = cached.scalar_one_or_none()
    if existing and existing.expires_at and existing.expires_at > datetime.now(timezone.utc):
        return _apply_cache(plot, existing)

    # Fetch from NSPD (runs synchronous pynspd in thread)
    feat = await asyncio.to_thread(_find_with_retry, cn)
    if feat is None:
        return False

    data = _extract_feature_data(feat)
    if data is None:
        return False

    geom = _extract_geometry(feat)

    # Build cache entry
    cache_entry = CadastreCache(
        cadastral_number=cn,
        data=data,
        geometry=geom,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )

    if existing:
        existing.data = cache_entry.data
        existing.geometry = cache_entry.geometry
        existing.expires_at = cache_entry.expires_at
        existing.fetched_at = datetime.now(timezone.utc)
    else:
        session.add(cache_entry)

    _apply_enrichment(plot, data, geom)
    return True


def _apply_nspd_data(plot: Plot, data: dict, geom) -> None:
    """Apply the authoritative NSPD snapshot while preserving listing data."""
    metadata = dict(plot.plot_metadata or {})
    metadata["nspd"] = jsonable_encoder(data)
    plot.plot_metadata = metadata

    for plot_field, nspd_field in _NSPD_FIELD_MAP.items():
        value = data.get(nspd_field)
        if value is None:
            continue
        if isinstance(value, (date, datetime)):
            value = value.isoformat()
        column_type = Plot.__table__.columns[plot_field].type
        max_length = getattr(column_type, "length", None)
        if isinstance(value, str) and max_length is not None:
            value = value[:max_length]
        setattr(plot, plot_field, value)
    if geom is not None:
        plot.geometry = geom
    plot.imported_from = "nspd"
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)


def _apply_enrichment(plot: Plot, data: dict, geom):
    """Apply a fresh NSPD response to a Plot."""
    _apply_nspd_data(plot, data, geom)


def _apply_cache(plot: Plot, cache: CadastreCache) -> bool:
    """Apply cached cadastre data to a Plot."""
    _apply_nspd_data(plot, cache.data, cache.geometry)
    return True


async def batch_enrich(session: AsyncSession, tenant_id: str, limit: int = 50) -> int:
    """Enrich plots that are missing geometry from NSPD."""
    result = await session.execute(
        select(Plot).where(
            Plot.tenant_id == tenant_id,
            Plot.is_active,
            Plot.geometry.is_(None),
        ).limit(limit)
    )
    plots = result.scalars().all()
    enriched = 0
    for plot in plots:
        if await enrich_from_cadastre(session, plot):
            enriched += 1
        await asyncio.sleep(0.5)
    await session.commit()
    return enriched


async def enrich_single_plot(session: AsyncSession, plot_id: str) -> bool:
    """Force-enrich a single plot by ID (for admin actions)."""
    from uuid import UUID
    result = await session.execute(
        select(Plot).where(Plot.id == UUID(plot_id), Plot.is_active)
    )
    plot = result.scalar_one_or_none()
    if not plot:
        return False
    ok = await enrich_from_cadastre(session, plot)
    if ok:
        await session.commit()
    return ok


async def lookup_cadastre(cadastral_number: str) -> dict[str, Any] | None:
    """Look up cadastral data from NSPD without saving. Returns flat dict for admin form."""
    if not _NSPD_AVAILABLE:
        return None
    feat = await asyncio.to_thread(_find_with_retry, cadastral_number, 3)
    if feat is None:
        return None
    data = _extract_feature_data(feat)
    if data is None:
        return None
    geom_geojson = _extract_geometry_geojson(feat)
    centroid_lat, centroid_lng = _centroid(feat)
    return {
        "cadastral_number": data.get("cad_num"),
        "address": data.get("address"),
        "area_m2": data.get("area_m2"),
        "category": data.get("category"),
        "permitted_use": data.get("permitted_use"),
        "cadastral_value": data.get("cost_value"),
        "cad_unit": data.get("cad_unit"),
        "cad_status": data.get("cad_status"),
        "object_type": data.get("object_type"),
        "land_plot_type": data.get("land_plot_type"),
        "registration_date": data.get("registration_date"),
        "ownership_form": data.get("ownership_form"),
        "geometry": geom_geojson,
        "center_lng": centroid_lng,
        "center_lat": centroid_lat,
    }


async def import_landplots_in_contour(
    session: AsyncSession,
    tenant_id,
    settlement_id,
    contour,
) -> dict[str, int]:
    """Import NSPD plots fully or mostly inside the saved boundary."""
    if not _NSPD_AVAILABLE or Nspd is None:
        raise RuntimeError("pynspd is not available")

    def fetch():
        _wait_cooldown()
        try:
            with Nspd(client_timeout=30, client_retries=0) as nspd:
                features = nspd.search_landplots_in_contour(contour)
            _register_success()
            return features or []
        except Exception as exc:
            if _is_blocked(exc):
                _register_block()
            raise RuntimeError("NSPD contour import is temporarily unavailable") from exc

    features = await asyncio.to_thread(fetch)
    try:
        import_boundary = make_valid(contour) if not contour.is_valid else contour
    except Exception as exc:
        raise RuntimeError("Saved settlement boundary is invalid") from exc
    if import_boundary.is_empty:
        raise RuntimeError("Saved settlement boundary is empty")

    imported = updated = skipped = excluded = 0
    candidates: list[tuple[str, dict, object]] = []
    for feature in features:
        data = _extract_feature_data(feature)
        cadastral_number = str((data or {}).get("cad_num") or "").strip()
        if not cadastral_number:
            skipped += 1
            continue
        plot_shape = _extract_feature_shape(feature)
        if plot_shape is None or plot_shape.is_empty or plot_shape.geom_type not in {"Polygon", "MultiPolygon"}:
            skipped += 1
            continue
        if not plot_shape.is_valid:
            plot_shape = make_valid(plot_shape)
        if plot_shape.is_empty or plot_shape.geom_type not in {"Polygon", "MultiPolygon"}:
            skipped += 1
            continue
        if not shape_is_covered_by_majority(plot_shape, import_boundary):
            excluded += 1
            continue
        candidates.append((cadastral_number, data or {}, from_shape(plot_shape, srid=4326)))

    cadastral_numbers = list({number for number, _, _ in candidates})
    existing_by_number: dict[str, Plot] = {}
    if cadastral_numbers:
        existing_result = await session.execute(
            select(Plot).where(
                Plot.tenant_id == tenant_id,
                Plot.cadastral_number.in_(cadastral_numbers),
            )
        )
        existing_by_number = {plot.cadastral_number: plot for plot in existing_result.scalars()}

    seen_numbers: set[str] = set()
    for cadastral_number, data, geometry in candidates:
        if cadastral_number in seen_numbers:
            skipped += 1
            continue
        seen_numbers.add(cadastral_number)
        plot = existing_by_number.get(cadastral_number)
        if plot is None:
            plot = Plot(
                tenant_id=tenant_id,
                settlement_id=settlement_id,
                cadastral_number=cadastral_number,
                status=PlotStatus.free,
                imported_from="nspd",
            )
            session.add(plot)
            existing_by_number[cadastral_number] = plot
            imported += 1
        else:
            if plot.settlement_id is None:
                plot.settlement_id = settlement_id
            updated += 1
        plot.is_active = True
        _apply_nspd_data(plot, data, geometry)
    return {
        "found": len(features),
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "excluded": excluded,
    }
