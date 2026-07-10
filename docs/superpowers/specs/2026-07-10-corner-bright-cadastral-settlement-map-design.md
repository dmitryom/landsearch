# Corner Bright Cadastral Settlement Map

## Goal

Turn the existing settlement screen into a LandScanner-style interactive sales map for the `Корнер Брайт` settlement. It must show the full surrounding cadastral parcel grid while keeping the project's 12 sale plots prominent and actionable.

## Map Composition

The settlement page at `/settlements/[id]` uses the existing MapLibre base maps. A `Кадастр ЕГРН` switch enables a neutral, transparent WMS overlay of parcel boundaries at zoom 13 and above. It is enabled by default when the zoom threshold is reached. The overlay never replaces the base map or the application's sale plots.

Sale plots are drawn above the cadastral overlay with status colors: free, reserved, booked, and sold. Their border remains visible against satellite and scheme base maps. Selecting a sale plot highlights it and opens a compact property card with cadastral number, status, area, price, and a link to the existing plot page. The map fits the settlement boundary, not a hard-coded city center.

## Data and Service Boundary

The backend owns access to the external cadastral WMS. Nginx exposes a same-origin, parameter-restricted tile endpoint; the frontend may request only `{z}/{x}/{y}` tiles and cannot choose an arbitrary upstream URL. Nginx sends the required upstream request metadata, applies short cache headers, and has rate and timeout limits.

The proxy must validate the upstream TLS chain. It must not disable certificate verification. If the upstream or cache is unavailable, the overlay is silently omitted and the map, sale plots, and property cards continue to work. A non-blocking unavailable state is shown only after a requested overlay fails.

## User Experience

The map toolbar contains base-map selection and a labelled cadastral toggle. The legend distinguishes `Кадастровые границы ЕГРН` from sale-status colors. On touch devices, the selected plot card opens from the bottom; on desktop, it occupies a fixed side panel without covering the map controls.

## Verification

Tests cover tile URL construction, overlay toggle state, the zoom threshold, and sale-plot layer ordering. Production smoke checks verify the WMS proxy returns an image with trusted TLS, the cadastral overlay visibly loads over all base maps, every Corner Bright sale plot remains selectable, and map failure does not hide application data.
