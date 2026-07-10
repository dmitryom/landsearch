#!/usr/bin/env bash
# Publish one generated LandScanner HTML artifact with same-origin map assets.
set -euo pipefail

source_html="${1:?source HTML path is required}"
output_html="${2:?output HTML path is required}"
frontend_dir="${LANDSEARCH_FRONTEND_DIR:-/root/landsearch/frontend}"
maplibre_dir="$frontend_dir/node_modules/maplibre-gl/dist"
asset_dir="$(dirname "$output_html")/assets"

test -f "$source_html"
test -f "$maplibre_dir/maplibre-gl.js"
test -f "$maplibre_dir/maplibre-gl.css"

install -d -m 755 "$asset_dir"
install -m 644 "$maplibre_dir/maplibre-gl.js" "$asset_dir/maplibre-gl.js"
install -m 644 "$maplibre_dir/maplibre-gl.css" "$asset_dir/maplibre-gl.css"

tmp_output="$(mktemp "$(dirname "$output_html")/.full-map.XXXXXX")"
trap 'rm -f "$tmp_output"' EXIT

sed \
  -e 's#https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.css#/settlement-map-assets/maplibre-gl.css#g' \
  -e 's#https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.js#/settlement-map-assets/maplibre-gl.js#g' \
  -e 's#https://demotiles.maplibre.org/font/#/settlement-map-glyphs/#g' \
  -e 's#https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/#/tiles/esri/imagery/#g' \
  -e 's#https://[abcd].basemaps.cartocdn.com/light_only_labels/#/tiles/carto/labels/#g' \
  "$source_html" > "$tmp_output"

install -m 644 "$tmp_output" "$output_html"
