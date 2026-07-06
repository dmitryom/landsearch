#!/usr/bin/env python3
"""Discover all cadastral districts in Tatarstan (region 16).

Uses NSPD search and filters by actual cadastral number prefix (16:DD:),
excluding address-only fuzzy matches.
"""

import asyncio
import json
import logging
import random
import sys
import time
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)


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
_lock = threading.Lock()
_district_db = set()


def _is_block(e):
    t = str(e)
    return "BlockedIP" in type(e).__name__ or "403" in t or "429" in t or "заблокирован" in t


def nspd_search(pattern: str):
    from pynspd import Nspd

    _guard.wait()
    try:
        with Nspd(client_timeout=30, client_retries=0) as n:
            r = n.search(pattern)
        _guard.on_ok()
        return r or []
    except Exception as e:
        if "NotFound" in type(e).__name__:
            return []
        if _is_block(e):
            _guard.on_block()
        return []


def check_district(code: str) -> tuple[bool, int, str | None]:
    """Check if a district code belongs to Tatarstan by filtering cadastral numbers."""
    features = nspd_search(f"{code}:%")
    if not features:
        return False, 0, None

    # Filter to only results where cad_num starts with district code
    valid = 0
    sample_name = None
    for feat in features:
        try:
            d = feat.properties.options.model_dump()
            cn = d.get("cad_num") or d.get("cad_number") or ""
            if cn.startswith(f"{code}:"):
                valid += 1
                if not sample_name:
                    sample_name = (d.get("readable_address") or d.get("address_readable_address") or "")[:80]
        except Exception:
            continue

    return valid > 0, valid, sample_name


def discover_quarters(code: str) -> list[str]:
    """Discover cadastral quarters in a district."""
    features = nspd_search(f"{code}:%")
    if not features:
        return []

    quarters = set()
    for feat in features:
        try:
            d = feat.properties.options.model_dump()
            cn = d.get("cad_num") or d.get("cad_number") or ""
            if cn.startswith(f"{code}:"):
                q = d.get("quarter_cad_number") or ""
                if q.startswith(f"{code}:"):
                    quarters.add(q)
        except Exception:
            continue

    return sorted(quarters)


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--recheck-quarters", action="store_true", help="Re-discover quarters for found districts")
    args = parser.parse_args()

    logger.info("=== Discovering Tatarstan cadastral districts ===")

    # Known Tatarstan districts from cadastral division
    all_candidates = [f"16:{i:02d}" for i in range(1, 53)]

    districts = {}
    total_valid = 0
    total_fuzzy = 0

    for code in all_candidates:
        ok, count, sample = check_district(code)
        if ok:
            districts[code] = {
                "plot_count": count,
                "sample_address": sample,
            }
            logger.info(f"  ✓ {code}: {count} plots")
            total_valid += 1
        else:
            logger.info(f"  ✗ {code}: no cadastral objects")
            total_fuzzy += 1

    logger.info(f"\n=== Found {total_valid} districts ({total_fuzzy} skipped) ===")

    # Discover quarters
    quarters = {}
    for code in districts:
        if args.recheck_quarters:
            qs = discover_quarters(code)
        else:
            qs = []
        quarters[code] = qs
        if qs:
            logger.info(f"  {code}: {len(qs)} quarters")
        await asyncio.sleep(0.3)

    # Save
    output = {
        "districts": {k: v["sample_address"] for k, v in districts.items()},
        "plot_counts": {k: v["plot_count"] for k, v in districts.items()},
        "quarters": quarters,
        "total_districts": len(districts),
        "total_quarters": sum(len(q) for q in quarters.values()),
    }

    output_path = Path(__file__).parent / "tatarstan_cadastre.json"
    with open(output_path, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
