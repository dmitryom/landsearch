# Corner Bright LandScanner Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the actual LandScanner settlement map for Corner Bright at a stable LandSearch URL.

**Architecture:** Extend LandScanner's offline generator to accept a supplied GeoJSON boundary, run the existing settlement-analysis and MapLibre artifact generator once for Corner Bright, and serve the generated HTML through a narrowly scoped LandSearch Nginx location. LandSearch keeps its current analytics page and links users to the generated map.

**Tech Stack:** Python 3.11, Shapely, LandScanner, MapLibre GL, Next.js, Nginx, pytest, Node test runner.

## Global Constraints

- Do not call the LandScanner scan while a visitor opens the map.
- Use the saved Corner Bright boundary from LandSearch; do not substitute a synthetic rectangle.
- Preserve existing LandScanner user changes in `pyproject.toml` and `settlement_analysis.py`.
- Serve only the fixed generated artifact; do not expose arbitrary filesystem paths.
- Keep the map's external MapLibre, raster, glyph, and deep-link origins restricted to the artifact route.

---

### Task 1: Add a boundary-override entry point to the LandScanner generator

**Files:**
- Modify: `deploy/generate_one.py` in the LandScanner repository
- Create: `tests/test_generate_one_boundary.py` in the LandScanner repository

**Interfaces:**
- Consumes: a GeoJSON Polygon or MultiPolygon file via `--boundary-file`.
- Produces: the existing `SettlementReport` and `settlement_<slug>_map.html` artifact without calling boundary discovery.

- [ ] **Step 1: Write a failing test**

```python
def test_boundary_file_replaces_boundary_discovery(tmp_path, monkeypatch):
    boundary = tmp_path / 'corner-bright.geojson'
    boundary.write_text('{"type":"Polygon","coordinates":[]}', encoding='utf-8')
    assert parse_args(['Корнер Брайт', '--boundary-file', str(boundary)]).boundary_file == boundary
```

- [ ] **Step 2: Verify the test fails**

Run: `pytest tests/test_generate_one_boundary.py -q`

Expected: import or argument-parsing failure because the flag does not exist.

- [ ] **Step 3: Implement the boundary override**

Use `argparse`, read the file as GeoJSON, validate `Polygon` or `MultiPolygon` through `shapely.shape`, then replace only the generator instance's `boundary_provider` with a small provider whose `get_boundary()` returns `(geometry, 'provided')`. Invoke the unchanged `SettlementAnalysisService.analyze()` pipeline so the existing parcel completion, cadastral quarters, ZOUIT, filters, and `MapGenerator.generate_settlement_html()` remain the sole engine.

- [ ] **Step 4: Run the focused and map-generator tests**

Run: `pytest tests/test_generate_one_boundary.py tests/test_map_generator.py -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit only the generator and its test**

```bash
git add deploy/generate_one.py tests/test_generate_one_boundary.py
git commit -m "feat: generate LandScanner map from supplied boundary"
```

### Task 2: Publish the generated artifact through LandSearch

**Files:**
- Modify: `frontend/app/settlements/[id]/page.tsx` in the LandSearch repository
- Create: `deploy/nginx/corner-bright-landscanner-map.conf` in the LandSearch repository
- Create: `frontend/tests/settlement-map-link.test.mjs` in the LandSearch repository

**Interfaces:**
- Consumes: `GET /settlements/eafe5fc4-165f-421e-aa79-3ae786458627/map`.
- Produces: a `Карта посёлка` command on the Corner Bright analytics page and an Nginx location that serves only the generated artifact.

- [ ] **Step 1: Write a failing frontend test**

```javascript
test('settlement page links Corner Bright to the generated map', async () => {
  const source = await readFile(page, 'utf8')
  assert.match(source, /Карта посёлка/)
  assert.match(source, /\/settlements\/\$\{id\}\/map/)
})
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test frontend/tests/settlement-map-link.test.mjs`

Expected: the command is absent.

- [ ] **Step 3: Implement the LandSearch route contract**

Add a command beside the settlement title that opens `/settlements/${id}/map` in the same tab. Add an exact production Nginx location for the Corner Bright settlement id that aliases `/var/lib/landscanner/artifacts/corner-bright/full_map.html`, returns `text/html`, and supplies a dedicated CSP permitting only `self`, `unpkg.com`, `server.arcgisonline.com`, `*.basemaps.cartocdn.com`, and `demotiles.maplibre.org`. Keep all other routes under the existing strict headers.

- [ ] **Step 4: Run the frontend gates**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs && npm run test:map-layer-selection && npm run build`

Expected: all tests pass and the production build succeeds.

- [ ] **Step 5: Commit the LandSearch integration**

```bash
git add frontend/app/settlements/[id]/page.tsx frontend/tests/settlement-map-link.test.mjs deploy/nginx/corner-bright-landscanner-map.conf
git commit -m "feat: publish Corner Bright settlement map"
```

### Task 3: Generate, deploy, and verify production

**Files:**
- Modify: `docs/LESSON-monitoring.md` in the LandSearch repository

**Interfaces:**
- Consumes: LandSearch settlement `eafe5fc4-165f-421e-aa79-3ae786458627` and the deployed LandScanner generator.
- Produces: `/var/lib/landscanner/artifacts/corner-bright/full_map.html` and the public map URL.

- [ ] **Step 1: Fetch the saved settlement GeoJSON and generate the artifact**

Run on production after the LandScanner commit is installed:

```bash
install -d -o landscanner -g landscanner /var/lib/landscanner/artifacts/corner-bright
curl -fsS https://v3163460.hosted-by-vdsina.ru/api/v1/settlements/eafe5fc4-165f-421e-aa79-3ae786458627 \
  | /opt/landscanner/venv/bin/python -c 'import json, sys; print(json.dumps(json.load(sys.stdin)["geometry"]))' \
  > /var/lib/landscanner/artifacts/corner-bright/boundary.geojson
cd /var/lib/landscanner/artifacts/corner-bright
runuser -u landscanner -- /opt/landscanner/venv/bin/python /opt/landscanner/app/deploy/generate_one.py \
  'Корнер Брайт' --boundary-file /var/lib/landscanner/artifacts/corner-bright/boundary.geojson
```

- [ ] **Step 2: Validate the artifact before exposing it**

Run: `rg -q "plots-cad-suffix|cadastral-quarters|Смежные участки НСПД" /var/lib/landscanner/artifacts/corner-bright/full_map.html`

Expected: exit code `0`.

- [ ] **Step 3: Apply only the reviewed map location and reload Nginx**

Run: `nginx -t && systemctl reload nginx`

Expected: configuration test succeeds and existing LandSearch routes remain available.

- [ ] **Step 4: Smoke-test in a real browser**

Open `/settlements/eafe5fc4-165f-421e-aa79-3ae786458627/map`, confirm the LandScanner panel and parcel layers render, search or click a known parcel, switch at least one layer control, and inspect console errors.

- [ ] **Step 5: Push the two scoped commits and record the operation**

```bash
git -C /path/to/LandScanner push origin main
git -C /path/to/landsearch push origin master
```

Add the exact generation and smoke-check commands to `docs/LESSON-monitoring.md`, run `git diff --check`, then commit the runbook change.
