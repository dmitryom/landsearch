# Corner Bright Cadastral Settlement Map

## Goal

Publish the actual LandScanner settlement-map artifact for the `Корнер Брайт` settlement under the LandSearch domain. The map must use the LandScanner engine's vector parcel collection, cadastral quarters, filters, labels, selection highlight, and property popups.

## Map Composition

LandScanner receives the exact saved geometry of the LandSearch settlement as a boundary override and runs its existing settlement-analysis pipeline offline. The generated `full_map.html` contains its normal MapLibre layers: parcel polygons, nearby parcels, cadastral quarters, permitted-use and ownership filters, labels, ZOUIT, a cadastral-number search, and selected-plot highlighting. LandSearch links to the published map from the settlement page.

## Data and Service Boundary

The scan is an explicit offline generation step, never a request made while a visitor opens the map. It runs under the existing `landscanner` service account, validates TLS through the engine's configured client, and produces a static artifact. LandSearch serves only the finished artifact; a failed or stale generation leaves the existing site and settlement analytics available.

## User Experience

The LandSearch settlement page exposes a clear `Карта посёлка` command. The target is the full-screen LandScanner map; its existing responsive summary panel, layer controls, filters, legend, and map popups remain intact.

## Verification

Tests cover the boundary-override generator, artifact publication path, and the settlement-page map command. Production smoke checks verify a generated artifact contains the expected LandScanner parcel and quarter layers, the map opens at its LandSearch URL, and a known Corner Bright sale plot is selectable.
