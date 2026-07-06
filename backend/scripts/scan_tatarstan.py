#!/usr/bin/env python3
"""Parallel scanner for all Tatarstan cadastral districts.

Commits results incrementally to avoid losing data on timeout.

Usage:
    python3 scripts/scan_tatarstan.py                    # Full scan
    python3 scripts/scan_tatarstan.py --district 16:24   # Single district  
    python3 scripts/scan_tatarstan.py --skip-quarters    # District scan only
"""

import asyncio
import json
import logging
import os
import random
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Plot, PlotStatus, Tenant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "LANDSEARCH_DATABASE_URL",
    "postgresql+asyncpg://landsearch:FMmEHcWlw1cY2kTxeWuZ@localhost:5432/landsearch",
)

DISTRICTS = {f"16:{i:02d}": f"Район {i:02d}" for i in range(1, 53)}


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
            self._cooldown = min(120.0, max(5.0, self._cooldown * 1.5 + 5))
            jitter = 1 + random.uniform(0, 0.5)
            self._until = time.monotonic() + self._cooldown * jitter
            return self._cooldown

    def on_ok(self):
        with self._lock:
            self._cooldown = max(0.0, self._cooldown * 0.7)
            if self._cooldown < 0.5:
                self._cooldown = 0.0
                self._until = 0.0


_guard = BlockGuard()


def _is_block(e):
    t = str(e)
    return "BlockedIP" in type(e).__name__ or "403" in t or "429" in t or "заблокирован" in t


def nspd_search(pattern: str, attempts=3):
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
                cd = _guard.on_block()
                logger.warning(f"Blocked '{pattern}', cooling {cd:.0f}s")
            if i < attempts - 1:
                delay = min(60, (3 if not _is_block(e) else 8) * (1.5 ** i) + random.uniform(0, 3))
                time.sleep(delay)
    return []


def _extract(feat, prefix: str):
    try:
        d = feat.properties.options.model_dump()
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


def scan_and_discover(code: str) -> tuple[list[dict], set[str]]:
    features = nspd_search(f"{code}:%")
    if not features:
        return [], set()

    plots = []
    quarters = set()
    for feat in features:
        data = _extract(feat, f"{code}:")
        if data:
            plots.append(data)
        try:
            d = feat.properties.options.model_dump()
            q = d.get("quarter_cad_number") or ""
            if q.startswith(f"{code}:") and len(q) > 7:
                quarters.add(q)
        except Exception:
            continue

    return plots, quarters


def search_quarter(q: str, prefix: str) -> list[dict]:
    features = nspd_search(f"{q}:%")
    if not features:
        return []
    results = []
    for feat in features:
        data = _extract(feat, prefix)
        if data:
            results.append(data)
    return results


def make_plots(batch: list[dict], tid: str) -> list[Plot]:
    return [Plot(
        tenant_id=tid,
        cadastral_number=p["cadastral_number"],
        address=p["address"],
        area_m2=p["area_m2"],
        category=p["category"],
        permitted_use=p["permitted_use"],
        cad_unit=p["cad_unit"],
        cad_status=p["cad_status"],
        object_type=p["object_type"],
        land_plot_type=p["land_plot_type"],
        registration_date=p["registration_date"],
        ownership_form=p["ownership_form"],
        cadastral_value=p["cadastral_value"],
        geometry=p["geometry"],
        is_active=True,
        status=PlotStatus.free,
    ) for p in batch]


async def commmit_batch(session: AsyncSession, plots: list[dict], existing: set, tid: str) -> int:
    """Insert plots, skip existing."""
    new = []
    for p in plots:
        cn = p["cadastral_number"]
        if cn not in existing:
            existing.add(cn)
            new.append(p)
    if not new:
        return 0
    for i in range(0, len(new), 500):
        chunk = new[i:i + 500]
        session.add_all(make_plots(chunk, tid))
        await session.flush()
    await session.commit()
    return len(new)


async def scan_all(max_workers=5, districts=None, skip_quarters=False, tenant_id=None):
    t0 = time.time()
    engine = create_async_engine(DATABASE_URL, pool_size=max_workers + 2)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        if tenant_id:
            tid = tenant_id
        else:
            r = await session.execute(select(Tenant).where(Tenant.slug == "demo-tenant"))
            t = r.scalar_one_or_none()
            if not t:
                logger.error("No demo tenant")
                return
            tid = str(t.id)
        result = await session.execute(select(Plot.cadastral_number))
        existing = {r[0] for r in result.fetchall()}

    logger.info(f"Existing: {len(existing)} plots, tenant: {tid}")
    districts_to_scan = districts or DISTRICTS
    total_added = 0

    # ── Phase 1: District scan ──
    logger.info(f"Phase 1: scanning {len(districts_to_scan)} districts ({max_workers} workers)")

    district_data = {}

    def worker_district(code_name):
        code, name = code_name
        plots, quarters = scan_and_discover(code)
        return code, name, plots, quarters

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(worker_district, d): d for d in districts_to_scan.items()}
        for fut in as_completed(futures):
            code, name, plots, quarters = fut.result()
            district_data[code] = {"name": name, "plots": plots, "quarters": quarters}
            logger.info(f"  {name} ({code}): {len(plots)} plots, {len(quarters)} quarters")

    # Collect and commit Phase 1
    all_quarters = set()
    phase1_plots = []
    seen = set()
    for code, data in district_data.items():
        for p in data["plots"]:
            cn = p["cadastral_number"]
            if cn not in seen:
                seen.add(cn)
                phase1_plots.append(p)
        all_quarters.update(data["quarters"])

    async with async_session() as session:
        added = await commmit_batch(session, phase1_plots, existing, tid)
        total_added += added
    logger.info(f"Phase 1 done: +{added} plots (total {total_added}), {len(all_quarters)} quarters discovered")

    # Save quarters
    q_output = {c: sorted(district_data[c]["quarters"]) for c in district_data if district_data[c]["quarters"]}
    (Path(__file__).parent / "quarters.json").write_text(json.dumps(q_output, ensure_ascii=False, indent=2))

    if skip_quarters or not all_quarters:
        logger.info("Skipping quarter scans")
        elapsed = time.time() - t0
        logger.info(f"═══ Done: +{total_added} in {elapsed:.0f}s ═══")
        return total_added

    # ── Phase 2: Quarter scan ──
    logger.info(f"Phase 2: scanning {len(all_quarters)} quarters ({max_workers} workers)")

    def worker_quarter(q):
        return q, search_quarter(q, f"{q}:")

    quarter_list = sorted(all_quarters)
    quarter_added = 0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(worker_quarter, q): q for q in quarter_list}
        batch = []
        done = 0
        for fut in as_completed(futures):
            q, plots = fut.result()
            done += 1
            if not plots:
                continue
            new_q = 0
            for p in plots:
                if p["cadastral_number"] not in seen:
                    seen.add(p["cadastral_number"])
                    batch.append(p)
                    new_q += 1
            if new_q:
                logger.info(f"  {q}: +{new_q} ({done}/{len(quarter_list)})")

            # Commit every 100 plots
            if len(batch) >= 100:
                async with async_session() as session:
                    added = await commmit_batch(session, batch, existing, tid)
                    quarter_added += added
                    total_added += added
                batch = []

        # Final batch
        if batch:
            async with async_session() as session:
                added = await commmit_batch(session, batch, existing, tid)
                quarter_added += added
                total_added += added

    logger.info(f"Phase 2 done: +{quarter_added} new plots")
    elapsed = time.time() - t0
    logger.info(f"═══ Done: +{total_added} plots in {elapsed:.0f}s ({elapsed/60:.1f}m) ═══")


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--district")
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--skip-quarters", action="store_true")
    parser.add_argument("--tenant-id")
    args = parser.parse_args()

    districts = {args.district: args.district} if args.district else None
    await scan_all(max_workers=args.workers, districts=districts, skip_quarters=args.skip_quarters, tenant_id=args.tenant_id)


if __name__ == "__main__":
    asyncio.run(main())
