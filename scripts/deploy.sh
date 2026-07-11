#!/bin/bash
# Deploy script — standalone mode
set -euo pipefail

cd /root/landsearch/frontend
BUILD_DIR=".next"
STANDALONE_DIR="$BUILD_DIR/standalone"

# 1. Backup old static chunks
if [ -d "$BUILD_DIR/static/chunks" ]; then
    mkdir -p /tmp/landsearch-old-chunks
    cp -r "$BUILD_DIR/static/chunks" /tmp/landsearch-old-chunks/ 2>/dev/null || true
fi

# 2. Build new
NEXT_PUBLIC_API_URL="${API_URL:-https://v3163460.hosted-by-vdsina.ru/api/v1}" NODE_ENV=production npm run build

# 3. Copy static files & BUILD_ID into standalone for correct serving
if [ -d "$STANDALONE_DIR" ]; then
    mkdir -p "$STANDALONE_DIR/.next"
    cp -r "$BUILD_DIR/static" "$STANDALONE_DIR/.next/static"
    cp "$BUILD_DIR/BUILD_ID" "$STANDALONE_DIR/.next/BUILD_ID" 2>/dev/null || true
fi

# 4. Merge old chunks back so cached browsers can still load them
if [ -d /tmp/landsearch-old-chunks/chunks ]; then
    cp -rn /tmp/landsearch-old-chunks/chunks/* "$BUILD_DIR/static/chunks/" 2>/dev/null || true
    rm -rf /tmp/landsearch-old-chunks
fi

# 5. Restart (uses standalone server via systemd unit)
systemctl restart landsearch-frontend
echo "Deploy complete"
