#!/bin/bash
cd /root/landsearch/backend
export $(cat .env | xargs)
exec python3 scripts/fetch_geometry.py --all-missing --workers 8 >> /tmp/geometry_fetch.log 2>&1
