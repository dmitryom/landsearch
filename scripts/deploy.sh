#!/bin/bash
# Deploy script — preserves old chunks for cached browsers
set -euo pipefail

cd /root/landsearch/frontend
BUILD_DIR=".next"

# 1. Backup old static chunks
if [ -d "$BUILD_DIR/static/chunks" ]; then
    mkdir -p /tmp/landsearch-old-chunks
    cp -r "$BUILD_DIR/static/chunks" /tmp/landsearch-old-chunks/ 2>/dev/null || true
fi

# 2. Build new
NEXT_PUBLIC_API_URL=http://195.2.74.197/api/v1 npm run build

# 3. Merge old chunks back so cached browsers can still load them
if [ -d /tmp/landsearch-old-chunks/chunks ]; then
    cp -rn /tmp/landsearch-old-chunks/chunks/* "$BUILD_DIR/static/chunks/" 2>/dev/null || true
    rm -rf /tmp/landsearch-old-chunks
fi

# 4. Restart
systemctl restart landsearch-frontend
echo "Deploy complete"
