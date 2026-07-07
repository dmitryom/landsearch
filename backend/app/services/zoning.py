from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ZoningLayerConfig:
    layer_id: int
    category_id: int
    source: str
    title: str


@dataclass(frozen=True)
class QuarterLayerConfig:
    layer_id: int
    title: str


TERRITORIAL_ZONE_LAYER = ZoningLayerConfig(
    layer_id=875838, category_id=472819, source="pzz",
    title="Территориальные зоны ПЗЗ",
)

FUNCTIONAL_ZONE_LAYER = ZoningLayerConfig(
    layer_id=875836, category_id=472817, source="genplan",
    title="Функциональные зоны (Генплан)",
)

CADASTRAL_QUARTER_LAYER = QuarterLayerConfig(layer_id=36048, title="Кадастровые кварталы")

ZONE_CLASS_TITLES: dict[str, str] = {
    "Ж": "Жилые",
    "ОД": "Общественно-деловые",
    "П": "Производственные",
    "Р": "Рекреационные",
    "СХ": "Сельскохозяйственные",
    "И": "Инженерно-транспортные",
    "С": "Специального назначения",
    "unknown": "Не классифицированы",
}

ZONE_CLASS_COLORS: dict[str, str] = {
    "Ж": "#F57C00",
    "ОД": "#8E24AA",
    "П": "#616161",
    "Р": "#2E7D32",
    "СХ": "#FBC02D",
    "И": "#0288D1",
    "С": "#C62828",
    "unknown": "#90A4AE",
}

_ZONE_CLASS_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Ж", re.compile(r"\bж[\s\-]?(\d{0,2})", re.IGNORECASE)),
    ("ОД", re.compile(r"\bод[\s\-]?(\d{0,2})", re.IGNORECASE)),
    ("П", re.compile(r"\bп[\s\-]?(\d{1,2})", re.IGNORECASE)),
    ("Р", re.compile(r"\bр[\s\-]?(\d{0,2})", re.IGNORECASE)),
    ("СХ", re.compile(r"\bсх[\s\-]?(\d{0,2})", re.IGNORECASE)),
    ("И", re.compile(r"\b(?:ит|и)[\s\-]?(\d{0,2})", re.IGNORECASE)),
    ("С", re.compile(r"\bс[\s\-]?(\d{1,2})", re.IGNORECASE)),
)

_WORD_FALLBACKS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Ж", ("жилая", "жилой", "жилого", "жилых", "застройк")),
    ("ОД", ("общественно", "деловая", "деловой", "обществен")),
    ("П", ("производствен", "промышлен", "коммунально-склад")),
    ("Р", ("рекреацион", "парков", "озеленен", "природн")),
    ("СХ", ("сельскохозяйствен", "сельхоз")),
    ("И", ("инженерн", "транспорт", "улично-дорожн")),
    ("С", ("специальн", "режимн", "оборон")),
)


def classify_zone_code(*texts: str | None) -> tuple[str | None, str]:
    normalized = " ".join(
        str(t).replace("ё", "е").replace("Ё", "Е")
        for t in texts if t not in (None, "")
    )
    if not normalized.strip():
        return None, "unknown"

    for zone_class, pattern in _ZONE_CLASS_PATTERNS:
        match = pattern.search(normalized)
        if match is None:
            continue
        suffix = (match.group(1) or "").strip()
        code = f"{zone_class}-{suffix}" if suffix else zone_class
        return code, zone_class

    lowered = normalized.lower()
    for zone_class, keywords in _WORD_FALLBACKS:
        if any(kw in lowered for kw in keywords):
            return None, zone_class

    return None, "unknown"


def color_for_class(zone_class: str) -> str:
    return ZONE_CLASS_COLORS.get(zone_class, ZONE_CLASS_COLORS["unknown"])


_INT_FIELDS = ("max_floors", "max_storey", "max_storeys", "floors_max")
_HEIGHT_FIELDS = ("max_height", "max_height_m", "height_max")
_BUILT_PCT_FIELDS = ("max_build_percent", "max_built_pct", "build_percent", "built_percent")
_SETBACK_FIELDS = ("min_setback", "min_setback_m", "setback_min", "min_distance")
_TEXT_FIELDS = (
    "regulation_text", "description", "content_restrict_encumbrances",
    "regulation", "restrictions", "content", "town_planning_regulation",
)
_USES_FIELDS = (
    "permitted_uses", "permitted_use",
    "permittedUseEstablishedByDocument", "permitted_use_established_by_document",
)


def _to_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return None


def _to_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


_FLOOR_RE = re.compile(
    r"(?:этажност\w*|количеств\w*\s+этажей|кол-во\s+этажей)\s*[—\-:–]?\s*(?:не\s+более\s+)?(\d{1,2})",
    re.IGNORECASE,
)
_HEIGHT_RE = re.compile(
    r"высот\w*\s*[^\d]{0,20}(\d{1,3})(?:[.,](\d+))?\s*м",
    re.IGNORECASE,
)
_BUILT_PCT_RE = re.compile(
    r"процент\w*\s+застройк\w*\s*[—\-:–]?\s*(?:не\s+более\s+)?(\d{1,3})",
    re.IGNORECASE,
)
_SETBACK_RE = re.compile(
    r"отступ\w*[^\d]{0,30}(\d{1,3})(?:[.,](\d+))?\s*м",
    re.IGNORECASE,
)


def parse_regulation(options: dict | None) -> dict | None:
    if not isinstance(options, dict) or not options:
        return None

    max_floors: int | None = None
    for key in _INT_FIELDS:
        max_floors = _to_int(options.get(key))
        if max_floors is not None:
            break

    max_height: float | None = None
    for key in _HEIGHT_FIELDS:
        max_height = _to_float(options.get(key))
        if max_height is not None:
            break

    max_built_pct: float | None = None
    for key in _BUILT_PCT_FIELDS:
        max_built_pct = _to_float(options.get(key))
        if max_built_pct is not None:
            break

    min_setback: float | None = None
    for key in _SETBACK_FIELDS:
        min_setback = _to_float(options.get(key))
        if min_setback is not None:
            break

    permitted_uses: list[str] = []
    for key in _USES_FIELDS:
        value = options.get(key)
        if value in (None, ""):
            continue
        if isinstance(value, list):
            permitted_uses.extend(str(v) for v in value if v not in (None, ""))
        else:
            permitted_uses.append(str(value))
        if permitted_uses:
            break

    raw_text_parts: list[str] = []
    for key in _TEXT_FIELDS:
        value = options.get(key)
        if value not in (None, ""):
            raw_text_parts.append(str(value))
    raw_text = " ".join(raw_text_parts).strip() or None

    if raw_text:
        if max_floors is None:
            match = _FLOOR_RE.search(raw_text)
            if match:
                max_floors = _to_int(match.group(1))
        if max_height is None:
            match = _HEIGHT_RE.search(raw_text)
            if match:
                whole, frac = match.group(1), match.group(2) or "0"
                max_height = _to_float(f"{whole}.{frac}")
        if max_built_pct is None:
            match = _BUILT_PCT_RE.search(raw_text)
            if match:
                max_built_pct = _to_float(match.group(1))
        if min_setback is None:
            match = _SETBACK_RE.search(raw_text)
            if match:
                whole, frac = match.group(1), match.group(2) or "0"
                min_setback = _to_float(f"{whole}.{frac}")

    if (
        max_floors is None and max_height is None
        and max_built_pct is None and min_setback is None
        and not permitted_uses and not raw_text
    ):
        return None

    return {
        "max_floors": max_floors,
        "max_height_m": max_height,
        "max_built_pct": max_built_pct,
        "min_setback_m": min_setback,
        "permitted_uses": permitted_uses,
        "raw_text": raw_text,
    }
