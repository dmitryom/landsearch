# General Settlements Map Design

## Goal

The public map's empty general mode shows the commercial parcel catalog for every settlement, while the neutral NSPD cadastre remains a separate layer that users can independently enable or disable.

## Current Problem

The public tenant currently has 1,573 active catalog plots: 1,440 assigned to Corner Bright and 133 unassigned. Empty general mode requests every active plot, so the 133 unassigned cadastral records appear beside settlement inventory. Selecting Corner Bright works because the existing `settlement_id` boundary scope removes those records.

## Selected Approach

Add an explicit `settlements_only=true` query option to public plot list, GeoJSON, and MVT endpoints. The option restricts results to active plots whose `settlement_id` is not null. Existing admin and direct-search behavior remains unchanged because the option defaults to false.

The home page applies this option only when neither a settlement nor a search query is active. Selecting a settlement keeps the existing majority-within-boundary behavior. Searching a cadastral number, address, or plot keeps access to the complete catalog.

The existing NSPD master switch becomes the independent neutral cadastral layer. Its label changes to `Нейтральный кадастр NSPD`, it stays off by default, and toggling it does not move the viewport. Its child controls continue to select parcels, buildings, structures, and unfinished objects.

## Data Flow

1. Empty general mode derives map/list filters with `settlements_only=true`.
2. The public list and MVT endpoints add `plots.settlement_id IS NOT NULL`.
3. Every settlement with imported or assigned plots appears in the same colored commercial layer.
4. A selected settlement supplies `settlement_id` instead and keeps its current boundary scope.
5. The NSPD switch independently adds or removes neutral official cadastral layers.

## Compatibility

- No database migration is required.
- Admin plot tables keep access to assigned and unassigned records.
- URL state does not expose the internal `settlements_only` flag.
- Direct plot search continues to cover the full tenant catalog.
- Existing status colors, roads, POIs, and selected-plot behavior remain unchanged.

## Verification

- Backend unit tests cover list and MVT predicates for `settlements_only`.
- Frontend tests prove empty general mode adds the flag, selected/search modes do not, and NSPD remains independently controlled.
- Production build must pass.
- Browser verification covers desktop and mobile, empty general mode, Corner Bright selection, NSPD on/off, and unchanged viewport after toggling.
