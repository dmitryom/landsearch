import asyncio
import logging
from datetime import datetime, timedelta, timezone

from geoalchemy2 import WKBElement
from shapely import wkb
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CadastreCache, Plot

logger = logging.getLogger(__name__)

_NSPD_AVAILABLE = False
try:
    from pynspd import Nspd
    _NSPD_AVAILABLE = True
except ImportError:
    logger.warning("pynspd not available, cadastre enrichment disabled")


async def enrich_from_cadastre(session: AsyncSession, plot: Plot) -> bool:
    if not _NSPD_AVAILABLE:
        return False

    cn = plot.cadastral_number.strip()
    cached = await session.execute(
        select(CadastreCache).where(CadastreCache.cadastral_number == cn)
    )
    existing = cached.scalar_one_or_none()
    if existing and existing.expires_at and existing.expires_at > datetime.now(timezone.utc):
        return _apply_cache(plot, existing)

    try:
        nspd = Nspd()
        data = await asyncio.to_thread(nspd.find_by_cadastral, cn)
        if not data:
            return False

        geom_wkb = None
        if hasattr(data, "geometry") and data.geometry:
            geom_wkb = WKBElement(data.geometry.wkb, srid=4326)

        cache_entry = CadastreCache(
            cadastral_number=cn,
            data={
                "address": data.address,
                "area_m2": data.area_m2,
                "category": data.category,
                "permitted_use": data.permitted_use,
                "cadastral_value": data.cadastral_value,
                "cad_unit": data.cad_unit,
                "cad_status": data.status,
                "latitude": data.latitude,
                "longitude": data.longitude,
            },
            geometry=geom_wkb,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )

        if existing:
            existing.data = cache_entry.data
            existing.geometry = cache_entry.geometry
            existing.expires_at = cache_entry.expires_at
            existing.fetched_at = datetime.now(timezone.utc)
        else:
            session.add(cache_entry)

        _apply_enrichment(plot, data, geom_wkb)
        return True
    except Exception as e:
        logger.warning("Failed to enrich %s: %s", cn, e)
        return False


def _apply_enrichment(plot: Plot, data, geom_wkb):
    if data.address and not plot.address:
        plot.address = data.address
    if data.area_m2 and not plot.area_m2:
        plot.area_m2 = data.area_m2
    if data.category and not plot.category:
        plot.category = data.category
    if data.permitted_use and not plot.permitted_use:
        plot.permitted_use = data.permitted_use
    if hasattr(data, "cadastral_value") and data.cadastral_value and not plot.cadastral_value:
        plot.cadastral_value = data.cadastral_value
    if hasattr(data, "cad_unit") and data.cad_unit and not plot.cad_unit:
        plot.cad_unit = data.cad_unit
    if hasattr(data, "status") and data.status and not plot.cad_status:
        plot.cad_status = data.status
    if geom_wkb:
        plot.geometry = geom_wkb
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)


def _apply_cache(plot: Plot, cache: CadastreCache) -> bool:
    data = cache.data
    if data.get("address") and not plot.address:
        plot.address = data["address"]
    if data.get("area_m2") and not plot.area_m2:
        plot.area_m2 = data["area_m2"]
    if data.get("category") and not plot.category:
        plot.category = data["category"]
    if data.get("permitted_use") and not plot.permitted_use:
        plot.permitted_use = data["permitted_use"]
    if data.get("cadastral_value") and not plot.cadastral_value:
        plot.cadastral_value = data["cadastral_value"]
    if data.get("cad_unit") and not plot.cad_unit:
        plot.cad_unit = data["cad_unit"]
    if cache.geometry:
        plot.geometry = cache.geometry
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)
    return True


async def batch_enrich(session: AsyncSession, tenant_id: str):
    result = await session.execute(
        select(Plot).where(
            Plot.tenant_id == tenant_id,
            Plot.is_active == True,
            Plot.geometry.is_(None),
        ).limit(50)
    )
    plots = result.scalars().all()
    enriched = 0
    for plot in plots:
        if await enrich_from_cadastre(session, plot):
            enriched += 1
        await asyncio.sleep(0.5)
    await session.commit()
    return enriched
