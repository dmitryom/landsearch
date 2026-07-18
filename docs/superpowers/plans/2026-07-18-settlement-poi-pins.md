# Settlement POI Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-managed infrastructure pins and display published POIs from every settlement on the public LandSearch map.

**Architecture:** Store POIs as tenant-scoped PostGIS points linked to settlements. A dedicated FastAPI router provides public viewport GeoJSON and admin CRUD. The existing boundary map owns placement/edit interactions, while a shared MapLibre helper renders the same category visuals and clustered public POIs.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, PostgreSQL/PostGIS, Next.js 15, React 19, MapLibre GL JS, Lucide React, Tailwind CSS, Node test runner, pytest.

## Global Constraints

- Published POIs from all settlements are visible by default, even when `settlement_id` is selected.
- Admin mutations are tenant-scoped and require `admin` role.
- Public queries expose only published POIs from the public tenant and use viewport bounding boxes.
- Categories are `shop`, `playground`, `sports`, `checkpoint`, `entrance`, `exit`, `parking`, `school`, `kindergarten`, `cafe`, `medical`, `sales_office`, and `other`.
- `other` requires `custom_type_label`; every point requires a name and valid WGS84 coordinates.
- Use existing LandSearch tokens, MapLibre, and Lucide; do not introduce a UI framework.
- Keep unrelated dirty and untracked production files untouched.

---

### Task 1: POI persistence and API

**Files:**
- Create: `backend/alembic/versions/b6a31e0d8f2c_add_manual_settlement_boundaries.py`
- Create: `backend/alembic/versions/c8d1fdce5a91_scope_plot_numbers_to_tenant.py`
- Create: `backend/alembic/versions/d91f7c3a2b10_add_settlement_pois.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/__init__.py`
- Create: `backend/app/api/v1/pois.py`
- Modify: `backend/app/main.py`
- Create: `backend/unit_tests/test_pois.py`

**Interfaces:**
- Produces: `PoiType`, `SettlementPoi`, `SettlementPoiCreate`, `SettlementPoiUpdate`, `SettlementPoiResponse`.
- Produces: public `GET /api/v1/pois`, admin `GET /api/v1/pois/admin`, `POST /api/v1/pois`, `PATCH /api/v1/pois/{poi_id}`, and `DELETE /api/v1/pois/{poi_id}`.
- Public GeoJSON feature properties: `id`, `settlement_id`, `settlement_name`, `poi_type`, `custom_type_label`, `name`, and `description`.

- [ ] **Step 1: Add failing schema and router contract tests**

```python
def test_other_poi_requires_custom_type_label():
    with pytest.raises(ValidationError):
        SettlementPoiCreate(
            settlement_id=str(uuid4()), poi_type="other", name="Объект",
            longitude=49.1, latitude=55.7,
        )

def test_public_pois_are_published_and_not_settlement_filtered():
    source = inspect.getsource(pois_api.list_public_pois)
    assert "SettlementPoi.is_published" in source
    assert "settlement_id" not in inspect.signature(pois_api.list_public_pois).parameters
```

- [ ] **Step 2: Run the new test and confirm RED**

Run: `cd backend && PYTHONPATH=$PWD venv/bin/pytest -q unit_tests/test_pois.py`

Expected: collection fails because `app.api.v1.pois` and POI schemas do not exist.

- [ ] **Step 3: Add the migration chain and POI table**

Restore the already-applied boundary and tenant-unique migrations with:

```bash
cp /root/landsearch/backend/alembic/versions/b6a31e0d8f2c_add_manual_settlement_boundaries.py backend/alembic/versions/
cp /root/landsearch/backend/alembic/versions/c8d1fdce5a91_scope_plot_numbers_to_tenant.py backend/alembic/versions/
```

Then create revision `d91f7c3a2b10` with `down_revision = "c8d1fdce5a91"`.

```python
op.create_table(
    "settlement_pois",
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
    sa.Column("settlement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("settlements.id", ondelete="CASCADE"), nullable=False),
    sa.Column("poi_type", sa.String(32), nullable=False),
    sa.Column("custom_type_label", sa.String(100)),
    sa.Column("name", sa.String(255), nullable=False),
    sa.Column("description", sa.Text()),
    sa.Column("geometry", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
    sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
op.create_index("idx_settlement_pois_geometry", "settlement_pois", ["geometry"], postgresql_using="gist")
op.create_index("idx_settlement_pois_tenant_published", "settlement_pois", ["tenant_id", "is_published"])
op.create_index("idx_settlement_pois_settlement_id", "settlement_pois", ["settlement_id"])
```

- [ ] **Step 4: Implement model and validated schemas**

Use a string enum for API validation and a string database column for future category expansion.

```python
class PoiType(str, enum.Enum):
    shop = "shop"
    playground = "playground"
    sports = "sports"
    checkpoint = "checkpoint"
    entrance = "entrance"
    exit = "exit"
    parking = "parking"
    school = "school"
    kindergarten = "kindergarten"
    cafe = "cafe"
    medical = "medical"
    sales_office = "sales_office"
    other = "other"

class SettlementPoiCreate(BaseModel):
    settlement_id: str
    poi_type: PoiType
    custom_type_label: str | None = Field(None, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    longitude: float = Field(..., ge=-180, le=180)
    latitude: float = Field(..., ge=-90, le=90)
    is_published: bool = True

    @model_validator(mode="after")
    def validate_custom_type(self):
        if self.poi_type == PoiType.other and not (self.custom_type_label or "").strip():
            raise ValueError("Custom type label is required for other POIs")
        return self
```

- [ ] **Step 5: Implement tenant-scoped CRUD and public viewport GeoJSON**

The public handler must join `Settlement`, filter `SettlementPoi.is_published`, apply `tenant_id`, `geometry && ST_MakeEnvelope(...)`, optional category filters, order by creation, and cap at 2,000. It intentionally has no `settlement_id` parameter.

```python
@router.get("")
async def list_public_pois(
    bbox: str = Query(...),
    types: str | None = None,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
): ...

@router.post("", response_model=SettlementPoiResponse, status_code=201)
async def create_poi(
    body: SettlementPoiCreate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
): ...
```

Mutations resolve the POI and settlement with both `id` and `tenant_id`; geometry is written with `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)` or `WKTElement(Point(...).wkt, srid=4326)`.

Public responses use a five-minute Redis cache keyed by tenant, rounded bounding box, and category filter. Every successful create, update, or delete removes keys matching `landsearch:pois:{tenant_id}:*`; Redis failure must not fail the request.

- [ ] **Step 6: Register the router and verify GREEN**

Run: `cd backend && PYTHONPATH=$PWD venv/bin/pytest -q unit_tests/test_pois.py unit_tests/test_production_hardening.py`

Expected: all selected tests pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/alembic/versions backend/app/models/__init__.py backend/app/schemas/__init__.py backend/app/api/v1/pois.py backend/app/main.py backend/unit_tests/test_pois.py
git commit -m "feat: add settlement POI API"
```

---

### Task 2: Shared POI map layer and public all-settlement display

**Files:**
- Create: `frontend/lib/settlement-pois.tsx`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/components/MapView.tsx`
- Modify: `frontend/components/LayerSwitcher.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Consumes: `GET /pois?bbox=...` GeoJSON from Task 1.
- Produces: `POI_TYPES`, `POI_LABELS`, `POI_COLORS`, `addPoiLayers`, `setPoiLayerVisibility`, `updatePoiData`, and `removePoiLayers`.
- Adds `showSettlementPois?: boolean` to `MapView` and a default-on `Infrastructure` toggle to `LayerSwitcher`.

- [ ] **Step 1: Add failing public-map source tests**

```javascript
test('public map shows clustered POIs from all settlements', async () => {
  const mapView = await readFile(mapViewComponent, 'utf8')
  const poiMap = await readFile(settlementPoiMap, 'utf8')
  assert.match(mapView, /api\.pois\.geo\(\{ bbox/)
  assert.doesNotMatch(mapView, /api\.pois\.geo\(\{[^}]*settlement_id/)
  assert.match(poiMap, /cluster: true/)
  assert.match(poiMap, /settlement_name/)
  assert.match(poiMap, /createRoot/)
})
```

- [ ] **Step 2: Run the frontend test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: fails because `settlement-pois.tsx` and public POI fetching do not exist.

- [ ] **Step 3: Add frontend POI types and API methods**

```typescript
export type PoiType = 'shop' | 'playground' | 'sports' | 'checkpoint' | 'entrance' | 'exit' | 'parking' | 'school' | 'kindergarten' | 'cafe' | 'medical' | 'sales_office' | 'other'

export interface SettlementPoi {
  id: string
  settlement_id: string
  settlement_name: string
  poi_type: PoiType
  custom_type_label?: string | null
  name: string
  description?: string | null
  longitude: number
  latitude: number
  is_published: boolean
}

export interface PoiFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: Omit<SettlementPoi, 'longitude' | 'latitude' | 'is_published'>
  }>
}

pois: {
  geo: ({ bbox, types, signal }: { bbox: string; types?: string; signal?: AbortSignal }) =>
    request<PoiFeatureCollection>(`/pois?${new URLSearchParams({ bbox, ...(types ? { types } : {}) })}`, { signal }),
  adminList: (settlementId: string) => request<SettlementPoi[]>(`/pois/admin?settlement_id=${settlementId}`),
  create: (data: SettlementPoiInput) => request<SettlementPoi>('/pois', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SettlementPoiInput>) => request<SettlementPoi>(`/pois/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/pois/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 4: Implement clustered MapLibre POI rendering**

Create a clustered GeoJSON source. Use MapLibre circle/count layers for clusters and HTML markers only for unclustered features. Render category icons into marker elements with React `createRoot` and Lucide components. Popup content must be created through DOM text nodes, not unescaped HTML.

```typescript
map.addSource(POI_SOURCE_ID, {
  type: 'geojson',
  data,
  cluster: true,
  clusterMaxZoom: 13,
  clusterRadius: 48,
})
```

- [ ] **Step 5: Fetch the current viewport without settlement filtering**

On map load and debounced `moveend`, serialize `map.getBounds()` to `west,south,east,north`, abort the previous request, call `api.pois.geo({ bbox, signal })`, and update the POI source. Restore POI layers after `style.load`.

- [ ] **Step 6: Add the default-on layer toggle and verify GREEN**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: the public all-settlement POI test and existing 49 tests pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add frontend/lib/settlement-pois.tsx frontend/lib/api.ts frontend/components/MapView.tsx frontend/components/LayerSwitcher.tsx frontend/app/page.tsx frontend/tests/settlement-map-link.test.mjs
git commit -m "feat: show all settlement POIs on public map"
```

---

### Task 3: Admin placement, editing, dragging, publication, and deletion

**Files:**
- Create: `frontend/components/admin/PoiEditorControls.tsx`
- Modify: `frontend/components/admin/BoundaryEditor.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Consumes: Task 2 API methods and shared category constants.
- Produces: admin `Objects` tab, point draft flow, edit form, published toggle, drag update, and confirmed delete.

- [ ] **Step 1: Add failing admin journey source tests**

```javascript
test('admin boundary map manages settlement POIs', async () => {
  const editor = await readFile(boundaryEditorComponent, 'utf8')
  const controls = await readFile(poiEditorControls, 'utf8')
  assert.match(editor, /api\.pois\.adminList\(settlement\.id\)/)
  assert.match(editor, /modeRef\.current === 'poi'/)
  assert.match(editor, /draggable: true/)
  assert.match(controls, /Объекты/)
  assert.match(controls, /Опубликовать на карте/)
  assert.match(controls, /Удалить объект/)
})
```

- [ ] **Step 2: Run the frontend test and confirm RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: fails because POI admin controls do not exist.

- [ ] **Step 3: Implement focused controls**

`PoiEditorControls` owns category/name/description/publication form rendering and command buttons. It receives draft state and callbacks; it does not create or own a map.

```typescript
interface PoiEditorControlsProps {
  pois: SettlementPoi[]
  draft: SettlementPoiDraft | null
  selectedId: string | null
  busy: boolean
  onStartPlacement: (type: PoiType) => void
  onChange: (draft: SettlementPoiDraft) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}
```

- [ ] **Step 4: Integrate object mode with the existing map**

Extend `DrawingMode` with `poi`. Load `api.pois.adminList(settlement.id)`. A map click in object mode creates a draft at that coordinate. Existing markers select their POI; selected markers are draggable and persist coordinates on drag end. Boundary vertex markers and POI markers use separate refs so switching tabs cannot delete the wrong markers.

- [ ] **Step 5: Implement mutations and resilient state updates**

Create and update replace the matching list item from the server response. Delete uses `window.confirm`, removes only after a successful response, and keeps the item plus an error message on failure. Hidden POIs remain visible in admin with a muted marker.

- [ ] **Step 6: Verify GREEN and production build**

Run:

```bash
cd frontend
node --test tests/*.test.mjs
npm run build
```

Expected: all frontend tests pass and Next.js exits 0 after type checking and static generation.

- [ ] **Step 7: Commit Task 3**

```bash
git add frontend/components/admin/PoiEditorControls.tsx frontend/components/admin/BoundaryEditor.tsx frontend/tests/settlement-map-link.test.mjs
git commit -m "feat: manage POI pins in settlement admin"
```

---

### Task 4: Integration verification and production deployment

**Files:**
- Modify only if verification exposes a POI regression.
- Deployment source: the files committed in Tasks 1-3.

**Interfaces:**
- Consumes all previous tasks.
- Produces a migrated, deployed, and browser-verified production feature.

- [ ] **Step 1: Run complete automated verification**

```bash
cd backend && PYTHONPATH=$PWD venv/bin/pytest -q unit_tests
cd ../frontend && node --test tests/*.test.mjs && npm run build
git diff --check
```

Expected: zero failures, successful build, and no whitespace errors.

- [ ] **Step 2: Request independent code review**

Review the branch diff against `b6236c5`, specifically checking tenant isolation, public all-settlement behavior, XSS-safe popups, MapLibre cleanup, stale request cancellation, migrations, and missing tests. Fix every actionable P1/P2 finding and repeat Step 1.

- [ ] **Step 3: Deploy with backup and migration**

Back up every production source file being replaced under the directory produced by:

```bash
stamp=$(date +%Y%m%d-%H%M%S)
backup="/root/landsearch/.deploy-backups/poi-pins-$stamp"
mkdir -p "$backup"
```

Copy source, run `alembic upgrade head`, install the final `.next` atomically with `.next/static` inside standalone, restart `landsearch-backend` and `landsearch-frontend`, then require both services to become active and `/health` to report Postgres and Redis `ok`.

- [ ] **Step 4: Run the authenticated admin browser journey**

At desktop 1440x900:

1. Log in as the existing production admin.
2. Open `Admin -> Settlements` and select `Corner Bright`.
3. Open `Objects`, place a temporary `Shop` point, enter a unique test name, and save it published.
4. Drag it, edit its description, hide and republish it.
5. Open the public map without `settlement_id`; verify the point is visible and its popup shows the settlement.
6. Select a different settlement, pan back to the Corner Bright area, and verify the point remains available because POIs are not settlement-filtered.
7. Return to admin and delete the temporary point.

- [ ] **Step 5: Run visual, console, mobile, and API checks**

Capture desktop 1440x900 and mobile 390x844 screenshots. Require zero console errors. Verify public `GET /api/v1/pois?bbox=...` returns points from multiple settlement IDs, hidden points are absent, direct CSS/JS assets return 200, and existing cadastral tiles still return non-empty MVT.

- [ ] **Step 6: Final commit if verification required fixes**

If verification required fixes, list them with `git diff --name-only`, stage each owned path explicitly, and commit with:

```bash
git commit -m "fix: harden settlement POI workflow"
```
