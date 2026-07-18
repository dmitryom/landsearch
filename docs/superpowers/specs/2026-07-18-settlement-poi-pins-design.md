# LandSearch: custom settlement POI pins

## Goal

Allow an administrator to place and manage infrastructure points on the map in `Admin -> Settlements`. Published points from every settlement are visible on the public map even when no settlement is selected.

## User experience

### Admin map

The boundary editor gains two compact tabs: `Boundary` and `Objects`. The existing map remains the primary workspace.

In `Objects`, the administrator:

1. Selects a category.
2. Clicks the map to place a draft pin.
3. Enters a required name and optional description.
4. Publishes the point immediately or saves it hidden.

Existing points appear on the same map. Clicking one opens its edit form. A point can be dragged to a new location, renamed, published or hidden, and deleted after confirmation. Switching settlements shows only the selected settlement's points in the admin editor.

Categories are: shop, playground, sports ground, checkpoint, entrance, exit, parking, school, kindergarten, cafe, medical point, sales office, and other. `Other` requires a custom category label. Categories use consistent colors and Lucide icons.

### Public map

Published POIs from all settlements are enabled by default, independent of search and `settlement_id`. The layer switcher contains an `Infrastructure` checkbox. Selecting a settlement does not hide POIs from other settlements.

At small zoom levels POIs cluster. At detailed zoom levels each POI uses a category pin. Clicking a pin opens a popup with category, name, description, and settlement name. Hidden points never appear publicly.

## Data model

Add `settlement_pois`:

- `id`: UUID primary key;
- `tenant_id`: required tenant foreign key;
- `settlement_id`: required settlement foreign key with cascade delete;
- `poi_type`: validated string category;
- `custom_type_label`: nullable, required for `other`;
- `name`: required, maximum 255 characters;
- `description`: nullable text;
- `geometry`: PostGIS `Point`, SRID 4326;
- `is_published`: boolean, default true;
- `created_at`, `updated_at`.

Indexes cover tenant, settlement, publication state, and geometry with GiST. Coordinates must be valid WGS84 longitude and latitude. The API verifies that the referenced settlement belongs to the authenticated tenant.

## API

Create a `/api/v1/pois` router:

- `GET /pois?bbox=minLng,minLat,maxLng,maxLat&settlement_id=&types=` is public and returns published GeoJSON. Without `settlement_id`, it returns points for every settlement in the public tenant. A viewport bounding box is required for normal map requests and the response is capped at 2,000 features.
- `GET /pois/admin?settlement_id=` is admin-only and returns published and hidden points for one owned settlement.
- `POST /pois` is admin-only and creates a point.
- `PATCH /pois/{id}` is admin-only and updates fields or coordinates.
- `DELETE /pois/{id}` is admin-only and permanently removes a point.

Public responses include `settlement_id` and `settlement_name`, but no tenant-private fields. Mutations invalidate the POI cache for that tenant.

## Frontend architecture

- Add shared `PoiType`, `SettlementPoi`, labels, colors, and Lucide icon mapping.
- Add POI methods to the existing API client.
- Keep map ownership in `BoundaryEditor`; add object-mode state and a focused POI control component so boundary calculations remain isolated.
- Add a shared map helper that registers category pin images and creates clustered GeoJSON layers and popups.
- `MapView` fetches POIs after map load and debounced `moveend`, aborts stale requests, and keeps the POI source when the base style changes.
- The admin editor uses the same category visuals without clustering and supports drag-to-update.

## Failure handling

- A draft cannot save without a name, category, and valid coordinate.
- `Other` cannot save without a custom category label.
- Failed saves keep the draft and show a specific error.
- Failed public POI requests keep the cadastral map usable and do not show a global map failure.
- Delete requires confirmation and restores the item in the UI if the server rejects the request.

## Performance

- Public queries use the GiST geometry index and viewport bounding box.
- Requests are debounced by 250 ms and stale requests are cancelled.
- GeoJSON clustering is client-side; individual DOM markers are not created for every distant point.
- Public responses are short-cacheable and invalidated after admin changes.

## Tests and acceptance

1. Tenant-scoped create, update, publish/hide, drag-coordinate update, and delete.
2. Invalid coordinates, unknown categories, and missing custom labels are rejected.
3. Public endpoint returns published POIs from all settlements and excludes hidden or foreign-tenant POIs.
4. Bounding-box and category filters work and enforce the response cap.
5. Admin selection, placement, editing, dragging, hiding, and deletion work with mouse and keyboard-accessible forms.
6. Public map displays clusters, category pins, settlement-aware popups, and an infrastructure layer toggle.
7. Selecting one settlement does not hide other settlements' POIs.
8. POI layers survive base-map switches without duplication.
9. Desktop 1440x900 and mobile 390x844 have no panel overlap.
10. Backend tests, frontend tests, strict production build, authenticated browser journey, console check, and production health check pass.

