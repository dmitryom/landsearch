# Map Search Auto-Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the home map on the visible search results and distinguish the total result count from the 200-item page limit.

**Architecture:** `SearchBar` will preserve the selected suggestion's type and id. For a selected settlement or plot, `HomePage` will fetch its existing lightweight geometry and derive Polygon or MultiPolygon bounds using the same pattern as the LandScanner settlement map. `MapView` will fit those bounds when the query result changes. The API-provided `total` remains separate from the currently rendered page of plot cards.

**Tech Stack:** Next.js 15, React 19, TypeScript, MapLibre GL JS, Node.js test runner.

## Global Constraints

- Do not change backend contracts or fetch a full GeoJSON collection just to center the map.
- Preserve MapLibre base-layer switching and vector-tile filters.
- Use the current 200-item list only to derive a viewport; keep all results available through the vector-tile source.
- Verify with the existing Node test suite, production build, and a real production browser search.

---

### Task 1: Pass result bounds and total through the home-map UI

**Files:**
- Create: `frontend/lib/plot-bounds.ts`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/components/MapView.tsx`
- Modify: `frontend/components/PlotCardList.tsx`
- Test: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Produces: `getPlotBounds(plots): [[number, number], [number, number]] | null`
- Consumes: `Plot.center_lng`, `Plot.center_lat`, and `PlotListResponse.total`
- Extends: `MapView` with optional `resultBounds` and `PlotCardList` with required `total`

- [ ] **Step 1: Write the failing test**

```js
test('home search passes plot result bounds to MapView and displays API total', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const plotCards = await readFile(plotCardListComponent, 'utf8')

  assert.match(home, /getPlotBounds\(list\.items\)/)
  assert.match(home, /resultBounds=\{resultBounds\}/)
  assert.match(home, /total=\{plotsTotal\}/)
  assert.match(mapView, /resultBounds\?: maplibregl\.LngLatBoundsLike/)
  assert.match(mapView, /map\.fitBounds\(resultBounds/)
  assert.match(plotCards, /total: number/)
  assert.match(plotCards, /\{total\}/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/tests/settlement-map-link.test.mjs`

Expected: FAIL because `getPlotBounds`, `resultBounds`, and `total` do not exist in the home-map path.

- [ ] **Step 3: Implement the minimum behaviour**

```ts
export function getPlotBounds(plots: Plot[]): [[number, number], [number, number]] | null {
  const coordinates = plots.filter((plot) => Number.isFinite(plot.center_lng) && Number.isFinite(plot.center_lat))
  if (coordinates.length === 0) return null
  return [
    [Math.min(...coordinates.map((plot) => plot.center_lng!)), Math.min(...coordinates.map((plot) => plot.center_lat!))],
    [Math.max(...coordinates.map((plot) => plot.center_lng!)), Math.max(...coordinates.map((plot) => plot.center_lat!))],
  ]
}
```

`HomePage` records `list.total` and derives fallback bounds from `list.items`. A selected settlement or plot overrides that fallback with the bounds of its existing geometry. `MapView` performs `fitBounds` with padding and a safe maximum zoom when `resultBounds` change. `PlotCardList` displays `total` while retaining the existing paged list for cards and aggregate values.

- [ ] **Step 4: Run tests and build**

Run:

```bash
node frontend/tests/settlement-map-link.test.mjs
cd frontend && NODE_ENV=production NEXT_PUBLIC_API_URL=https://v3163460.hosted-by-vdsina.ru/api/v1 npm run build
```

Expected: all Node tests pass and Next.js production build completes.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-11-map-search-auto-center.md frontend
git commit -m "fix: center map on land search results"
```
