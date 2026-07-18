# LandSearch: neutral road overlay

## Goal

Make roads visually distinct on every LandSearch map without competing with parcel status colors or cadastral borders. The selected direction is `01 - Neutral asphalt`.

## Visual language

- Main road casing: `#4B5563`.
- Main road surface: `#D9DEE5`.
- Minor streets and service roads use the same palette with smaller widths.
- Tracks use a narrower dashed treatment.
- Road widths interpolate by zoom and begin at settlement-scale zoom levels.
- Parcel status colors and white cadastral borders remain unchanged.

The road network is a continuous neutral ribbon with a darker edge. This follows the common cottage-settlement masterplan pattern while avoiding yellow, orange, red, and green colors already assigned to parcel statuses.

## Data and delivery

- Data source: OpenStreetMap transportation geometry in the OpenMapTiles schema, served by OpenFreeMap.
- LandSearch exposes same-origin road TileJSON and MVT URLs under `/tiles/roads/`.
- Nginx proxies and caches upstream TileJSON and vector tiles.
- TileJSON URLs are rewritten to the LandSearch origin so browsers do not depend on cross-origin access.
- Required OpenStreetMap/OpenMapTiles attribution remains visible through MapLibre.
- The road source has `maxzoom: 14`; MapLibre overzooms it for closer settlement views.

OpenFreeMap has no SLA. The server cache reduces repeat requests and keeps already viewed tiles available, but a future fully self-hosted regional extract remains the long-term reliability option.

## Map integration

Create a focused `road-map-layers` module that owns source IDs, layer IDs, filters, paint expressions, insertion order, visibility, and idempotent reinitialization.

Road classes:

1. Major: motorway, trunk, primary, secondary.
2. Local: tertiary, street, street_limited, service.
3. Track: track and minor access geometry, rendered only at closer zoom.

Layer order:

1. Base imagery or map raster.
2. Road casing and surface.
3. Parcel status fills.
4. White cadastral parcel borders.
5. Selection highlight and labels.

When a base style changes, LandSearch re-adds roads before cadastral layers. Helper calls are idempotent so repeated style events cannot duplicate sources or layers.

## Controls

- Add `Roads OSM` to `Map layers -> Data layers` with a `Route` icon.
- The road overlay is enabled by default.
- The setting is saved locally and restored on reload.
- Turning roads off removes only road visibility; parcels, NSPD layers, and the base map remain unchanged.
- Public search, plot detail, settlement detail, standalone map, and boundary editor use the same road styling.

## Performance and failure handling

- Road layers use `minzoom` so low-zoom regional views do not request detailed settlement roads.
- Nginx caches successful TileJSON and MVT responses and serves stale cached data during upstream errors where possible.
- Vector tile failures do not replace or hide the base map and are not shown as blocking user errors.
- No road labels are duplicated; existing base-map labels stay responsible for names.

## Verification

1. Unit/source tests verify colors, class filters, minzoom, widths, and idempotency.
2. Integration tests verify roads are restored after every base-style switch.
3. Nginx configuration test verifies same-origin proxying, cache, URL rewrite, and attribution path.
4. Production build and existing frontend/backend tests pass.
5. Browser tests cover satellite and scheme base maps at settlement zoom.
6. Visual checks run at `1280x800`, `1440x900`, and `390x844`.
7. Road overlay remains below white parcel borders and does not change status fills.
8. Toggle state persists after reload and no duplicate road layers appear.
