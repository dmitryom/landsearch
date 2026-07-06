#!/usr/bin/env python3
"""LandSearch monitoring dashboard — prints service health metrics."""

import json
import subprocess
import time
import sys
import urllib.request

BASE = "https://v3163460.hosted-by-vdsina.ru"


def curl_json(url: str, timeout: int = 5) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "monitoring"})
        with urllib.request.urlopen(req, timeout=timeout, context=__import__("ssl").create_default_context()) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def curl_status(url: str, timeout: int = 5) -> int:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "monitoring"})
        with urllib.request.urlopen(req, timeout=timeout, context=__import__("ssl").create_default_context()) as r:
            return r.status
    except Exception:
        return 0


def check_services():
    print("=" * 60)
    print(f"  LandSearch Monitor — {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Frontend
    fe_status = curl_status(f"{BASE}/")
    fe_icon = "OK" if fe_status == 200 else f"FAIL({fe_status})"
    print(f"\n  Frontend:       {fe_icon}")

    # Backend health
    health = curl_json(f"{BASE}/health")
    if health and health.get("status") == "ok":
        pg = health.get("services", {}).get("postgres", "?")
        rd = health.get("services", {}).get("redis", "?")
        print(f"  Backend:        OK")
        print(f"  PostgreSQL:     {pg}")
        print(f"  Redis:          {rd}")
    else:
        print(f"  Backend:        FAIL — {health}")

    # API response time
    t0 = time.time()
    api_status = curl_status(f"{BASE}/api/v1/plots/geo?bbox=48.0,54.0,54.0,56.5")
    api_ms = (time.time() - t0) * 1000
    api_icon = "OK" if api_status == 200 else f"FAIL({api_status})"
    print(f"  API /plots/geo: {api_icon} ({api_ms:.0f}ms)")

    # Plot count
    geo = curl_json(f"{BASE}/api/v1/plots/geo?bbox=48.0,54.0,54.0,56.5")
    if geo and "features" in geo:
        print(f"  Plots loaded:   {len(geo['features'])}")
    else:
        print(f"  Plots loaded:   ERROR — {geo}")

    # Systemd services
    for svc in ["landsearch-backend", "landsearch-frontend", "landsearch-refresh.timer"]:
        result = subprocess.run(
            ["systemctl", "is-active", svc],
            capture_output=True, text=True, timeout=3
        )
        status = result.stdout.strip()
        icon = "OK" if status == "active" else f"FAIL({status})"
        print(f"  {svc:20s} {icon}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    check_services()
