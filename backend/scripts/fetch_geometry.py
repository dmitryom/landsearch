#!/usr/bin/env python3
"""Parallel fetch geometry for all plots without geometry from NSPD.

Uses ThreadPoolExecutor + BlockGuard for rate-limited parallel execution.

Usage:
    # Fetch all missing geometry
    python scripts/fetch_geometry.py --all-missing

    # Fetch specific cadastral numbers
    python scripts/fetch_geometry.py --cadastral-numbers "16:24:090704:9999"
"""

import asyncio
import logging
import os
import random
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Plot
from app.services.cadastre import _find_with_retry, _extract_geometry, _NSPD_AVAILABLE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "LANDSEARCH_DATABASE_URL",
    "postgresql+asyncpg://landsearch:FMmEHcWlw1cY2kTxeWuZ@localhost:5432/landsearch",
)


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


def fetch_one(cn: str, attempts=3):
    """Thread worker: fetch geometry for one cadastral number."""
    for i in range(attempts):
        _guard.wait()
        try:
            from pynspd import Nspd
            with Nspd(client_timeout=30, client_retries=0) as n:
                feat = n.find(cn)
            _guard.on_ok()
            if feat is None:
                return None, "not_found"
            geom = _extract_geometry(feat)
            if geom is None:
                return cn, "no_geom"
            return cn, geom
        except Exception as e:
            if _is_block(e):
                cd = _guard.on_block()
                logger.warning("Blocked %s, cooling %.0fs", cn, cd)
            if i < attempts - 1:
                delay = min(60, (3 if not _is_block(e) else 8) * (1.5 ** i) + random.uniform(0, 3))
                time.sleep(delay)
    return cn, "failed"


async def fetch_for_cadastral_numbers(cadastral_numbers: list[str]):
    engine = create_async_engine(DATABASE_URL, pool_size=4)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    for cn in cadastral_numbers:
        async with async_session() as session:
            result = await session.execute(
                select(Plot).where(Plot.cadastral_number == cn)
            )
            plot = result.scalar_one_or_none()
            if not plot:
                logger.warning("Not found in DB: %s", cn)
                continue
            if plot.geometry is not None:
                logger.info("Already has geometry: %s", cn)
                continue
            pid, geom = fetch_one(cn)
            if geom and isinstance(geom, str) is False:
                await session.execute(
                    update(Plot).where(Plot.id == plot.id).values(geometry=geom)
                )
                await session.commit()
                logger.info("Updated %s", cn)
            else:
                logger.info("No geometry for %s: %s", cn, geom)


async def fetch_all_missing(workers=8, batch_size=500, commit_every=200):
    engine = create_async_engine(DATABASE_URL, pool_size=workers + 2)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(
            select(Plot.id, Plot.cadastral_number).where(
                Plot.geometry.is_(None),
                Plot.cadastral_number.like("16:%"),
            )
        )
        rows = result.fetchall()
        all_cns = [(str(r[0]), r[1]) for r in rows]

    total = len(all_cns)
    logger.info("=== %d plots without geometry ===", total)
    if not total:
        return

    updated = 0
    skipped = 0
    failed = 0
    no_geom = 0
    done = 0
    update_batch = []

    t0 = time.time()

    def worker(pid_cn):
        pid, cn = pid_cn
        if "TEST" in cn.upper():
            return pid, cn, "skip"
        result = fetch_one(cn)
        return pid, cn, result

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(worker, item): item for item in all_cns}
        for fut in as_completed(futures):
            pid, cn, result = fut.result()
            done += 1

            if result is None:
                skipped += 1
            elif isinstance(result, tuple):
                _cn, geom = result
                if geom == "not_found":
                    skipped += 1
                elif geom == "no_geom":
                    no_geom += 1
                elif geom == "failed":
                    failed += 1
                else:
                    update_batch.append((pid, geom))
                    updated += 1

            # Commit periodically
            if len(update_batch) >= commit_every:
                async with async_session() as s:
                    for _pid, _geom in update_batch:
                        await s.execute(
                            update(Plot).where(Plot.id == _pid).values(geometry=_geom)
                        )
                    await s.commit()
                logger.info(
                    "  +%d geom (%d/%d done, %d failed, %d no_geom, %d skip)",
                    updated, done, total, failed, no_geom, skipped,
                )
                update_batch = []

        # Final commit
        if update_batch:
            async with async_session() as s:
                for _pid, _geom in update_batch:
                    await s.execute(
                        update(Plot).where(Plot.id == _pid).values(geometry=_geom)
                    )
                await s.commit()

    elapsed = time.time() - t0
    logger.info("═══ Done: +%d geom in %.0fs (%.1fm) ═══", updated, elapsed, elapsed / 60)
    logger.info("  total=%d updated=%d failed=%d no_geom=%d skipped=%d", total, updated, failed, no_geom, skipped)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fetch geometry from NSPD (parallel)")
    parser.add_argument("--all-missing", action="store_true", help="Fetch for all plots without geometry")
    parser.add_argument("--workers", type=int, default=8, help="Parallel workers")
    parser.add_argument("--commit-every", type=int, default=200, help="Commit batch size")
    parser.add_argument("--cadastral-numbers", nargs="+", help="Specific cadastral numbers")
    args = parser.parse_args()

    if args.all_missing:
        asyncio.run(fetch_all_missing(workers=args.workers, commit_every=args.commit_every))
    elif args.cadastral_numbers:
        asyncio.run(fetch_for_cadastral_numbers(args.cadastral_numbers))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
