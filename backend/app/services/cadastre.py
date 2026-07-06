import asyncio
import logging
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from geoalchemy2.shape import from_shape
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CadastreCache, Plot

logger = logging.getLogger(__name__)

_NSPD_AVAILABLE = False
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

_cooldown = 0.0
_cooldown_until = 0.0


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


def _extract_geometry(feat: NspdFeature) -> Any | None:
    """Extract PostGIS geometry from NspdFeature via shapely."""
    try:
        geom = getattr(feat, "geometry", None)
        if geom is None:
            return None
        shp = geom.to_shape()
        return from_shape(shp, srid=4326)
    except Exception as e:
        logger.debug("Geometry extraction failed: %s", e)
        return None


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


def _apply_enrichment(plot: Plot, data: dict, geom):
    """Apply enriched data to a Plot object (only fill missing fields)."""
    if data.get("address") and not plot.address:
        plot.address = data["address"]
    if data.get("area_m2") and not plot.area_m2:
        plot.area_m2 = data["area_m2"]
    if data.get("category") and not plot.category:
        plot.category = data["category"]
    if data.get("permitted_use") and not plot.permitted_use:
        plot.permitted_use = data["permitted_use"]
    if data.get("cost_value") and not plot.cadastral_value:
        plot.cadastral_value = data["cost_value"]
    if data.get("cad_unit") and not plot.cad_unit:
        plot.cad_unit = data["cad_unit"]
    if data.get("cad_status") and not plot.cad_status:
        plot.cad_status = data["cad_status"]
    if data.get("object_type") and not plot.object_type:
        plot.object_type = data["object_type"]
    if data.get("land_plot_type") and not plot.land_plot_type:
        plot.land_plot_type = data["land_plot_type"]
    if data.get("registration_date") and not plot.registration_date:
        plot.registration_date = data["registration_date"]
    if data.get("ownership_form") and not plot.ownership_form:
        plot.ownership_form = data["ownership_form"]
    if geom is not None:
        plot.geometry = geom
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)


def _apply_cache(plot: Plot, cache: CadastreCache) -> bool:
    """Apply cached cadastre data to a Plot."""
    data = cache.data
    if data.get("address") and not plot.address:
        plot.address = data["address"]
    if data.get("area_m2") and not plot.area_m2:
        plot.area_m2 = data["area_m2"]
    if data.get("category") and not plot.category:
        plot.category = data["category"]
    if data.get("permitted_use") and not plot.permitted_use:
        plot.permitted_use = data["permitted_use"]
    if data.get("cost_value") and not plot.cadastral_value:
        plot.cadastral_value = data["cost_value"]
    if data.get("cad_unit") and not plot.cad_unit:
        plot.cad_unit = data["cad_unit"]
    if data.get("cad_status") and not plot.cad_status:
        plot.cad_status = data["cad_status"]
    if data.get("object_type") and not plot.object_type:
        plot.object_type = data["object_type"]
    if data.get("land_plot_type") and not plot.land_plot_type:
        plot.land_plot_type = data["land_plot_type"]
    if data.get("registration_date") and not plot.registration_date:
        plot.registration_date = data["registration_date"]
    if data.get("ownership_form") and not plot.ownership_form:
        plot.ownership_form = data["ownership_form"]
    if cache.geometry:
        plot.geometry = cache.geometry
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)
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
