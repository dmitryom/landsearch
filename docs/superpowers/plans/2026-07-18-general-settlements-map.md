# General Settlements Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only plots assigned to any settlement in the empty public-map mode while keeping official NSPD cadastre as an independent neutral toggle.

**Architecture:** Add an opt-in `settlements_only` predicate to public plot list, GeoJSON, and MVT endpoints. Derive an internal frontend filter for empty general mode; selected-settlement and direct-search requests retain their existing scopes. Reuse the current NSPD layer manager, relabel its master control, and remove the viewport-changing side effect.

**Tech Stack:** FastAPI, SQLAlchemy, PostGIS, Next.js 15, React 19, MapLibre GL JS, Node test runner, pytest.

## Global Constraints

- No database migration.
- Do not change admin plot-list defaults.
- Do not expose `settlements_only` in browser URL state.
- Keep selected-settlement boundary behavior unchanged.
- Keep direct cadastral/address search tenant-wide.
- NSPD stays off by default and never changes the current viewport when toggled.

---

### Task 1: Backend settlement-catalog scope

**Files:**
- Modify: `backend/unit_tests/test_production_hardening.py`
- Modify: `backend/app/api/v1/plots.py`

**Interfaces:**
- Consumes: existing `Plot.settlement_id`, public tenant scope, list/GeoJSON/MVT endpoints.
- Produces: `settlements_only: bool = False` on all three read endpoints and `_apply_settlements_only_scope(stmt, enabled)`.

- [ ] **Step 1: Write failing backend tests**

Add a SQLAlchemy statement test proving enabled scope adds `plots.settlement_id IS NOT NULL` and disabled scope does not. Extend the MVT fake-session test to call `plot_tiles(..., settlements_only=True)` and assert the raw SQL and cache key include the new scope.

- [ ] **Step 2: Verify RED**

Run: `cd backend && ./venv/bin/pytest -q unit_tests/test_production_hardening.py`

Expected: failures because `_apply_settlements_only_scope` and the endpoint parameter do not exist.

- [ ] **Step 3: Implement the predicate**

Add:

```python
def _apply_settlements_only_scope(stmt, enabled: bool):
    return stmt.where(Plot.settlement_id.isnot(None)) if enabled else stmt
```

Apply it in `list_plots` and `plots_geojson`; include the flag in GeoJSON cache keys. In `plot_tiles`, add `settlements_only` to the cache key and append `p.settlement_id IS NOT NULL` to `where_clauses` only when true.

- [ ] **Step 4: Verify GREEN**

Run: `cd backend && ./venv/bin/pytest -q unit_tests/test_production_hardening.py unit_tests/test_pois.py`

Expected: all selected backend unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/plots.py backend/unit_tests/test_production_hardening.py
git commit -m "feat: scope general map to settlements"
```

### Task 2: Frontend general-mode filter and neutral NSPD control

**Files:**
- Modify: `frontend/tests/settlement-map-link.test.mjs`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/lib/map-tiles.ts`
- Modify: `frontend/components/LayerSwitcher.tsx`

**Interfaces:**
- Consumes: backend `settlements_only=true`, current user filters, `showTatarstanCadastre` state.
- Produces: `getPublicCatalogFilters(filters)` and independent `Нейтральный кадастр NSPD` toggle behavior.

- [ ] **Step 1: Write failing frontend tests**

Add assertions that the home page derives `publicCatalogFilters`, passes it to `loadData`, `MapView`, and `LayerSwitcher`, and only adds `settlements_only: 'true'` when both `query` and `settlement_id` are absent. Assert `map-tiles.ts` permits the parameter. Assert the layer switcher contains `Нейтральный кадастр NSPD` and no longer calls `map.fitBounds` from the master toggle.

- [ ] **Step 2: Verify RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: the new general-mode and neutral-toggle tests fail.

- [ ] **Step 3: Implement frontend behavior**

Create a pure helper in `page.tsx`:

```typescript
export function getPublicCatalogFilters(filters: Record<string, string>) {
  if (filters.settlement_id || filters.query?.trim()) return filters
  return { ...filters, settlements_only: 'true' }
}
```

Use the derived filters for list loading and colored MVT layers while preserving raw filters for URL state and controls. Add `settlements_only` to `TILE_FILTER_KEYS`. Rename the master label and remove the `fitBounds(TATARSTAN_BOUNDS, ...)` side effect.

- [ ] **Step 4: Verify GREEN**

Run: `cd frontend && node --test tests/*.test.mjs`

Expected: all frontend tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx frontend/lib/map-tiles.ts frontend/components/LayerSwitcher.tsx frontend/tests/settlement-map-link.test.mjs
git commit -m "feat: separate settlement inventory from cadastre"
```

### Task 3: Production verification and deployment

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: committed backend/frontend behavior.
- Produces: verified production release at `https://v3163460.hosted-by-vdsina.ru/`.

- [ ] **Step 1: Run static and build gates**

Run backend unit tests, all frontend tests, `git diff --check`, and `npm run build`. Expected: zero failures and a successful Next.js production build.

- [ ] **Step 2: Deploy with rollback backups**

Copy changed backend files and the validated `.next` build into `/root/landsearch`, restart `landsearch-backend` and `landsearch-frontend`, and retain timestamped rollback copies.

- [ ] **Step 3: Verify API behavior**

Confirm `/api/v1/plots?page_size=1&settlements_only=true` reports 1,440 while the unscoped endpoint reports 1,573. Confirm an MVT request with `settlements_only=true` returns a non-empty tile.

- [ ] **Step 4: Verify browser behavior**

At desktop 1440x900 and mobile 390x844, verify empty mode shows all settlement inventory, Corner Bright remains correct, direct search still works, and the neutral NSPD layer toggles independently without changing zoom or center.

- [ ] **Step 5: Inspect production health**

Confirm health status, active services, zero new browser console errors, and no new server `5xx` responses.
