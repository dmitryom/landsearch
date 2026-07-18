# Neutral Road Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-available, user-toggleable neutral road overlay to every LandSearch map while preserving parcel status colors, cadastral borders, and base-map labels.

**Architecture:** A focused `road-map-layers` module owns the OpenMapTiles transportation source, MapLibre layers, ordering, and visibility. Public pages share a persisted visibility setting; direct detail/editor maps use the same helper. Nginx exposes cached same-origin TileJSON and MVT endpoints backed by OpenFreeMap and rewrites upstream tile URLs.

**Tech Stack:** Next.js 14, React, TypeScript, MapLibre GL JS, Tailwind CSS, Node test runner, Nginx, OpenFreeMap/OpenMapTiles transportation MVT.

## Global Constraints

- Selected palette: casing `#4B5563`, surface `#D9DEE5`.
- Roads render below parcel fills, white cadastral borders, selection, and labels.
- Major roads: motorway, trunk, primary, secondary; local roads: tertiary, street, street_limited, service; tracks appear only at close zoom and use a dashed surface.
- Road overlay is enabled by default and persisted locally.
- Existing parcel status colors, cadastral geometry, and base-map labels must not change.
- Layer/source setup must be idempotent across `style.load` and base-style switches.
- No new frontend dependency is introduced.
- OpenStreetMap/OpenMapTiles attribution must remain available to MapLibre.

---

### Task 1: Road Map Layer Module

**Files:**
- Create: `frontend/lib/road-map-layers.ts`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Produces: `ROAD_SOURCE_ID`, `ROAD_LAYER_IDS`, `addRoadLayers(map, visible)`, and `setRoadLayerVisibility(map, visible)`.
- Consumes: a MapLibre `Map` whose style may be rebuilt after a base-layer switch.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that `road-map-layers.ts` exists and contains the two exact colors, `source-layer: "transportation"`, the required class filters, close-zoom track rendering, source/layer existence guards, and a same-origin `/tiles/roads/tiles.json` source URL.

```js
const roadLayers = readFileSync(join(frontendRoot, 'lib/road-map-layers.ts'), 'utf8')
assert.match(roadLayers, /#4B5563/)
assert.match(roadLayers, /#D9DEE5/)
assert.match(roadLayers, /source-layer['"]?:\s*['"]transportation['"]/)
assert.match(roadLayers, /\/tiles\/roads\/tiles\.json/)
assert.match(roadLayers, /getSource\(ROAD_SOURCE_ID\)/)
assert.match(roadLayers, /getLayer\(layer\.id\)/)
```

- [ ] **Step 2: Run the frontend test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because `frontend/lib/road-map-layers.ts` does not exist.

- [ ] **Step 3: Implement the idempotent MapLibre helper**

Create a vector source with URL `/tiles/roads/tiles.json` and attribution `© OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap`. Add casing and surface line layers for major, local, and track classes, with round joins/caps and zoom-interpolated widths. Insert roads before the first label raster layer when one exists; otherwise add them before cadastral plot layers. Visibility must use MapLibre `layout.visibility` and must not remove the source.

```ts
export const ROAD_SOURCE_ID = 'osm-roads'
export const ROAD_LAYER_IDS = [
  'osm-roads-major-casing', 'osm-roads-major-surface',
  'osm-roads-local-casing', 'osm-roads-local-surface',
  'osm-roads-track-casing', 'osm-roads-track-surface',
] as const

export function setRoadLayerVisibility(map: maplibregl.Map, visible: boolean) {
  const visibility = visible ? 'visible' : 'none'
  ROAD_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
  })
}
```

- [ ] **Step 4: Run the focused frontend test and confirm GREEN**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: all existing and new tests pass.

---

### Task 2: Persisted Toggle and Public Map Integration

**Files:**
- Create: `frontend/lib/use-persistent-boolean.ts`
- Modify: `frontend/components/LayerSwitcher.tsx`
- Modify: `frontend/components/MapView.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/map/page.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Produces: `usePersistentBoolean(key, defaultValue)` returning a React state tuple.
- `MapView` consumes `showRoads?: boolean`.
- `LayerSwitcher` consumes `showRoads?: boolean` and `onRoadsChange?: (enabled: boolean) => void`.

- [ ] **Step 1: Write failing public-integration tests**

Assert that both public pages create `landsearch:roads-visible` state, pass it to `MapView` and `LayerSwitcher`, and that both `MapView` style initialization paths call `addRoadLayers` before `addPlotTileLayers`. Assert the switcher exposes a labelled checkbox and reapplies roads during base-style reinitialization.

```js
assert.match(homePage, /usePersistentBoolean\(['"]landsearch:roads-visible['"],\s*true\)/)
assert.match(mapView, /addRoadLayers\(map,\s*showRoadsRef\.current\)/)
assert.ok(mapView.indexOf('addRoadLayers') < mapView.indexOf('addPlotTileLayers'))
assert.match(layerSwitcher, /Дороги/)
assert.match(layerSwitcher, /OpenStreetMap/)
```

- [ ] **Step 2: Run test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because the visibility hook and road props are absent.

- [ ] **Step 3: Implement hydration-safe local persistence**

Use existing `safeGet`/`safeSet` helpers. Read once after mount, accept only the strings `true` and `false`, and do not write the default before hydration completes.

```ts
export function usePersistentBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState(initialValue)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const stored = safeGet(key)
    if (stored === 'true' || stored === 'false') setValue(stored === 'true')
    setHydrated(true)
  }, [key])
  useEffect(() => {
    if (hydrated) safeSet(key, String(value))
  }, [hydrated, key, value])
  return [value, setValue] as const
}
```

- [ ] **Step 4: Add the `Дороги` control and style restoration**

Place the checkbox in `Слои данных` before the cadastral controls, use the existing Lucide `Route` icon, display source `OpenStreetMap`, and call both `onRoadsChange` and `setRoadLayerVisibility`. During base-style reinitialization call `addRoadLayers(map, showRoads)` before plot/NSPD helpers.

- [ ] **Step 5: Connect shared state on both public map routes**

Create `const [showRoads, setShowRoads] = usePersistentBoolean('landsearch:roads-visible', true)` in `app/page.tsx` and `app/map/page.tsx`, then pass `showRoads` to `MapView` and both props to `LayerSwitcher`.

- [ ] **Step 6: Run focused tests and TypeScript lint/build checks**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: all tests pass.

---

### Task 3: Detail Maps and Boundary Editor

**Files:**
- Modify: `frontend/app/plots/[id]/page.tsx`
- Modify: `frontend/app/settlements/[id]/page.tsx`
- Modify: `frontend/components/admin/BoundaryEditor.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Consumes: `addRoadLayers(map, true)` from Task 1.
- Produces: consistent roads on plot detail, settlement detail, and boundary editing maps.

- [ ] **Step 1: Write failing direct-map integration tests**

Assert all three files import `addRoadLayers` and call it in initial style load before local geometry is added. Assert plot and settlement base-layer switch handlers also restore roads.

- [ ] **Step 2: Run test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because direct maps do not restore roads.

- [ ] **Step 3: Add roads to each direct-map lifecycle**

Call `addRoadLayers(map, true)` immediately after the style becomes ready and before plot, settlement, or editable boundary sources are created. Repeat the call in every `style.load`/base switch reinitialization callback; the helper's guards prevent duplicates.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: all tests pass.

---

### Task 4: Same-Origin Cached Road Tiles

**Files:**
- Modify: `nginx.conf`
- Modify: production `/etc/nginx/sites-available/landsearch`
- Create: production `/etc/nginx/conf.d/landsearch-road-cache.conf`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Produces: `/tiles/roads/tiles.json` and `/tiles/roads/<version>/<z>/<x>/<y>.pbf`.
- Consumes: OpenFreeMap `https://tiles.openfreemap.org/planet` and versioned MVT paths returned by that TileJSON.

- [ ] **Step 1: Write failing Nginx contract tests**

Assert the tracked config contains exact TileJSON and tile locations, `proxy_ssl_server_name on`, cache directives, stale-cache policy, JSON `sub_filter`, same-origin rewrite, and permissive CORS.

```js
assert.match(nginxConfig, /location = \/tiles\/roads\/tiles\.json/)
assert.match(nginxConfig, /sub_filter[^;]*tiles\.openfreemap\.org\/planet\//)
assert.match(nginxConfig, /proxy_cache_use_stale/)
assert.match(nginxConfig, /location \/tiles\/roads\//)
```

- [ ] **Step 2: Run test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because road proxy locations are absent.

- [ ] **Step 3: Add tracked and live Nginx configuration**

Define a 32 MB key zone with a 4 GB cache and 30-day inactivity. Proxy TileJSON without upstream compression so `sub_filter` can rewrite `https://tiles.openfreemap.org/planet/` to `/tiles/roads/`. Cache metadata for one hour and vector tiles for 30 days. Serve stale data on timeout and 5xx responses. Add `X-Road-Tile-Cache` for operational verification.

- [ ] **Step 4: Validate Nginx and road endpoints**

Run: `nginx -t`

Expected: configuration syntax is successful.

Run: `curl -fsS https://v3163460.hosted-by-vdsina.ru/tiles/roads/tiles.json`

Expected: JSON contains `/tiles/roads/<version>/{z}/{x}/{y}.pbf` and no browser-facing `tiles.openfreemap.org` tile URL.

Run one URL from TileJSON with `curl -fsSI`.

Expected: HTTP 200 and a vector-tile/protobuf content type.

---

### Task 5: Production Build, Deploy, and Browser Verification

**Files:**
- Deploy only the files listed in Tasks 1-4 into `/root/landsearch`.

**Interfaces:**
- Consumes: completed road overlay, public controls, direct-map integration, and Nginx proxy.
- Produces: verified production behavior at `https://v3163460.hosted-by-vdsina.ru/`.

- [ ] **Step 1: Run complete automated verification in the isolated worktree**

Run: `cd frontend && npm test`

Expected: all frontend tests pass.

Run: `cd frontend && npm run build`

Expected: Next.js production build succeeds without TypeScript errors.

- [ ] **Step 2: Deploy atomically and restart the frontend**

Build in a temporary release directory or move the existing `.next` aside only after the new build succeeds. Restart `landsearch-frontend`, reload Nginx, and verify both services are active.

- [ ] **Step 3: Run production health checks**

Run: `curl -fsS https://v3163460.hosted-by-vdsina.ru/api/health`

Expected: healthy response.

Run: `curl -fsSI https://v3163460.hosted-by-vdsina.ru/`

Expected: HTTP 200.

- [ ] **Step 4: Verify desktop visually and functionally**

At `1280x800` and `1440x900`, open satellite then scheme base maps, zoom to settlement scale, verify light-gray road surfaces with dark casing, white cadastral borders above roads, unchanged status fills, working `Дороги` toggle, persistence after reload, and no duplicate MapLibre road layers after multiple base switches.

- [ ] **Step 5: Verify mobile visually and functionally**

At `390x844`, verify the layer control remains usable, the road toggle does not overlap the bottom sheet, roads render at settlement zoom, and plot selection remains accessible.

- [ ] **Step 6: Close every temporary browser session and report evidence**

Close Playwright sessions and the SOCKS tunnel. Report exact automated test totals, build status, endpoint checks, and screenshots/visual observations.
