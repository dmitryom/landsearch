#!/usr/bin/env python3
"""Fast NSPD scanner for Kazan region — optimized for speed.

Key optimizations vs LandScanner:
1. Single pass per district (no double-scan for settlements)
2. Batch commits (500 plots per flush)
3. Minimal extraction (no redundant model_dump)
4. Pre-filter by prefix before DB check

Usage:
    python3 scripts/scan_kazan.py                    # All districts
    python3 scripts/scan_kazan.py --district 16:24   # One district
    python3 scripts/scan_kazan.py --dry-run          # Preview only
"""

import asyncio
import logging
import os
import random
import sys
import time
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Plot, PlotStatus, Tenant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "LANDSEARCH_DATABASE_URL",
    "postgresql+asyncpg://landsearch:FMmEHcWlw1cY2kTxeWuZ@localhost:5432/landsearch",
)

DISTRICTS = {
    "16:24": "Казань",
    "16:16": "Высокогорский",
    "16:20": "Зеленодольский",
    "16:06": "Верхнеуслонский",
    "16:09": "Лаишевский",
    "16:27": "Пестречинский",
}


class BlockGuard:
    def __init__(self):
        self._lock = threading.Lock()
        self._cooldown = 0.0
        self._until = 0.0

    def wait(self):
        with self._lock:
            delay = self._until - time.monotonic()
        if delay > 0:
            time.sleep(delay)

    def on_block(self):
        with self._lock:
            self._cooldown = min(90.0, max(8.0, self._cooldown * 1.7))
            self._until = time.monotonic() + self._cooldown * (1 + random.uniform(0, 0.3))
            return self._cooldown

    def on_ok(self):
        with self._lock:
            self._cooldown = max(0.0, self._cooldown * 0.5)
            self._until = 0.0


_guard = BlockGuard()


def _is_block(e):
    t = str(e)
    return "BlockedIP" in type(e).__name__ or "403" in t or "429" in t or "заблокирован" in t


def nspd_search(pattern: str, attempts: int = 4):
    from pynspd import Nspd

    for i in range(attempts):
        _guard.wait()
        try:
            with Nspd(client_timeout=30, client_retries=0, client_dns_resolve=(i >= 2)) as n:
                r = n.search(pattern)
            _guard.on_ok()
            return r or []
        except Exception as e:
            if "NotFound" in type(e).__name__:
                return []
            if _is_block(e):
                _guard.on_block()
            if i < attempts - 1:
                time.sleep(min(30, (2 if not _is_block(e) else 8) * (1.5 ** i) + random.uniform(0, 2)))
    return []


def _extract(feat, prefix: str):
    """Extract plot dict from NSPD feature. Returns None if skip."""
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


async def scan_district(session: AsyncSession, code: str, name: str, tenant_id: str, dry_run: bool) -> int:
    logger.info(f"▶ {name} ({code})")

    existing = set()
    rows = await session.execute(
        select(Plot.cadastral_number).where(Plot.cadastral_number.like(f"{code}:%"))
    )
    existing = {r[0] for r in rows.fetchall()}
    logger.info(f"  DB has {len(existing)} plots")

    features = await asyncio.to_thread(nspd_search, f"{code}:%")
    if not features:
        logger.info(f"  NSPD returned nothing")
        return 0

    logger.info(f"  NSPD returned {len(features)} features")

    added = 0
    batch = []
    for feat in features:
        data = _extract(feat, code + ":")
        if not data or data["cadastral_number"] in existing:
            continue

        if dry_run:
            added += 1
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
            logger.info(f"  Flushed {added} plots")
            batch.clear()

    if batch:
        session.add_all(batch)
        await session.flush()

    logger.info(f"  ✓ {name}: +{added}")
    return added


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--district", help="District code e.g. 16:24")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--tenant-id")
    args = parser.parse_args()

    engine = create_async_engine(DATABASE_URL, pool_size=5)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        if args.tenant_id:
            tid = args.tenant_id
        else:
            r = await session.execute(select(Tenant).where(Tenant.slug == "demo-tenant"))
            t = r.scalar_one_or_none()
            if not t:
                logger.error("No demo tenant")
                return
            tid = str(t.id)

    districts = {args.district: DISTRICTS.get(args.district, args.district)} if args.district else DISTRICTS
    total = 0
    t0 = time.time()

    async with async_session() as session:
        for code, name in districts.items():
            added = await scan_district(session, code, name, tid, args.dry_run)
            total += added
            if not args.dry_run and added:
                try:
                    await session.commit()
                except Exception as e:
                    logger.error(f"Commit failed: {e}")
                    await session.rollback()
            await asyncio.sleep(1.5)

    elapsed = time.time() - t0
    logger.info(f"═══ Done: {total} plots in {elapsed:.0f}s ({elapsed/60:.1f}m) ═══")


if __name__ == "__main__":
    asyncio.run(main())
