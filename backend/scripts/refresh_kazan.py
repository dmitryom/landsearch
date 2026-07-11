#!/usr/bin/env python3
"""Refresh NSPD data for Kazan region — runs every 3 days via systemd timer.

Re-scans all districts to pick up new/changed plots.
"""

import asyncio
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Plot, PlotStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("LANDSEARCH_DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("LANDSEARCH_DATABASE_URL must be set")

DISTRICTS = {
    "16:24": "Казань",
    "16:16": "Высокогорский",
    "16:20": "Зеленодольский",
    "16:06": "Верхнеуслонский",
    "16:09": "Лаишевский",
    "16:27": "Пестречинский",
}


def nspd_search(pattern: str):
    from pynspd import Nspd
    try:
        with Nspd(client_timeout=30, client_retries=2) as nspd:
            return nspd.search(pattern) or []
    except Exception as e:
        logger.error(f"NSPD search failed for {pattern}: {e}")
        return []


def extract_plot_data(feat, prefix: str):
    try:
        props = feat.properties.options
        d = props.model_dump()
    except Exception:
        return None

    cn = d.get("cad_num") or d.get("cad_number") or ""
    if not cn.startswith(prefix):
        return None

    geom = None
    try:
        from geoalchemy2.shape import from_shape
        g = getattr(feat, "geometry", None)
        if g and hasattr(g, "to_shape"):
            shp = g.to_shape()
            if shp.geom_type == "MultiPolygon":
                shp = max(shp.geoms, key=lambda p: p.area)
            if shp.geom_type == "Polygon":
                geom = from_shape(shp, srid=4326)
    except Exception:
        pass

    return {
        "cadastral_number": cn[:100],
        "address": (d.get("readable_address") or d.get("address_readable_address") or "")[:500] or None,
        "area_m2": d.get("specified_area") or d.get("land_record_area_verified"),
        "category": (d.get("land_record_category_type") or "")[:100] or None,
        "permitted_use": (d.get("permitted_use_established_by_document") or d.get("land_record_type") or "")[:255] or None,
        "cad_unit": (d.get("quarter_cad_number") or "")[:100] or None,
        "cad_status": (d.get("status") or d.get("common_data_status") or "")[:100] or None,
        "object_type": (d.get("land_record_type") or "")[:100] or None,
        "land_plot_type": (d.get("land_plot_type") or "")[:100] or None,
        "registration_date": str(d.get("land_record_reg_date") or "")[:50] or None,
        "ownership_form": (d.get("ownership_type") or "")[:100] or None,
        "cadastral_value": d.get("cost_value"),
        "geometry": geom,
    }


async def refresh_district(session: AsyncSession, code: str, name: str, tenant_id: str) -> int:
    logger.info(f"▶ Refreshing {name} ({code})")

    existing = set()
    rows = await session.execute(
        select(Plot.cadastral_number).where(Plot.cadastral_number.like(f"{code}:%"))
    )
    existing = {r[0] for r in rows.fetchall()}
    logger.info(f"  DB has {len(existing)} plots")

    features = nspd_search(f"{code}:%")
    if not features:
        logger.info("  No results from NSPD")
        return 0

    logger.info(f"  NSPD returned {len(features)} features")

    added = 0
    batch = []
    for feat in features:
        data = extract_plot_data(feat, code + ":")
        if not data or data["cadastral_number"] in existing:
            continue

        batch.append(Plot(
            tenant_id=tenant_id,
            cadastral_number=data["cadastral_number"],
            address=data["address"],
            area_m2=data["area_m2"],
            category=data["category"],
            permitted_use=data["permitted_use"],
            cad_unit=data["cad_unit"],
            cad_status=data["cad_status"],
            object_type=data["object_type"],
            land_plot_type=data["land_plot_type"],
            registration_date=data["registration_date"],
            ownership_form=data["ownership_form"],
            cadastral_value=data["cadastral_value"],
            geometry=data["geometry"],
            is_active=True,
            status=PlotStatus.free,
        ))
        existing.add(data["cadastral_number"])
        added += 1

        if len(batch) >= 500:
            session.add_all(batch)
            await session.flush()
            batch.clear()

    if batch:
        session.add_all(batch)
        await session.flush()

    logger.info(f"  ✓ {name}: +{added} new plots")
    return added


async def main():
    engine = create_async_engine(DATABASE_URL, pool_size=5)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    from app.models import Tenant
    async with async_session() as session:
        r = await session.execute(select(Tenant).where(Tenant.slug == "demo-tenant"))
        t = r.scalar_one_or_none()
        if not t:
            logger.error("No demo tenant")
            return
        tid = str(t.id)

    total = 0
    t0 = time.time()

    async with async_session() as session:
        for code, name in DISTRICTS.items():
            added = await refresh_district(session, code, name, tid)
            total += added
            if added:
                try:
                    await session.commit()
                except Exception as e:
                    logger.error(f"Commit failed: {e}")
                    await session.rollback()
            await asyncio.sleep(2.0)

    elapsed = time.time() - t0
    logger.info(f"═══ Refresh complete: {total} new plots in {elapsed:.0f}s ═══")


if __name__ == "__main__":
    asyncio.run(main())
