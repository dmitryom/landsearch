import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const poiMapModule = new URL('../lib/settlement-pois.tsx', import.meta.url)
const apiClient = new URL('../lib/api.ts', import.meta.url)

test('POI clusters expand on click and unregister delegated pointer handlers', async () => {
  const source = await readFile(poiMapModule, 'utf8')

  assert.match(source, /getClusterExpansionZoom\(clusterId\)/)
  assert.match(source, /map\.easeTo\(\{[\s\S]{0,180}center:[\s\S]{0,120}zoom/)
  assert.match(source, /map\.on\('click', POI_CLUSTER_LAYER_ID, state\.clusterClickListener\)/)
  assert.match(source, /map\.on\('mouseenter', POI_CLUSTER_LAYER_ID, state\.clusterMouseEnterListener\)/)
  assert.match(source, /map\.on\('mouseleave', POI_CLUSTER_LAYER_ID, state\.clusterMouseLeaveListener\)/)
  assert.match(source, /map\.off\('click', POI_CLUSTER_LAYER_ID, state\.clusterClickListener\)/)
  assert.match(source, /map\.off\('mouseenter', POI_CLUSTER_LAYER_ID, state\.clusterMouseEnterListener\)/)
  assert.match(source, /map\.off\('mouseleave', POI_CLUSTER_LAYER_ID, state\.clusterMouseLeaveListener\)/)
})

test('POI marker refresh deduplicates features and reconciles unchanged markers', async () => {
  const source = await readFile(poiMapModule, 'utf8')
  const refreshStart = source.indexOf('const refreshMarkers = () => {')
  const refreshEnd = source.indexOf('const scheduleMarkerRefresh', refreshStart)
  const refresh = source.slice(refreshStart, refreshEnd)

  assert.notEqual(refreshStart, -1)
  assert.match(refresh, /const nextFeatures = new Map/)
  assert.match(refresh, /if \(nextFeatures\.has\(id\)\) continue/)
  assert.match(refresh, /const existing = current\.markers\.get\(id\)/)
  assert.match(refresh, /existing\?\.signature === signature/)
  assert.match(refresh, /if \(!nextFeatures\.has\(id\)\)/)
  assert.doesNotMatch(refresh, /if \(!current\) return\s+clearMarkers\(current\)/)
})

test('POI source events are gated and debounced before marker reconciliation', async () => {
  const source = await readFile(poiMapModule, 'utf8')

  assert.match(source, /if \(event\.sourceId !== POI_SOURCE_ID\) return/)
  assert.match(source, /markerRefreshTimer/)
  assert.match(source, /clearTimeout\(current\.markerRefreshTimer\)/)
  assert.match(source, /map\.on\('sourcedata', state\.sourceDataListener\)/)
  assert.match(source, /map\.off\('sourcedata', state\.sourceDataListener\)/)
})

test('POI API encodes mutation IDs in path segments', async () => {
  const source = await readFile(apiClient, 'utf8')

  assert.match(source, /update:[^\n]+encodeURIComponent\(id\)/)
  assert.match(source, /delete:[^\n]+encodeURIComponent\(id\)/)
})

test('POI marker accessible label includes name category and settlement', async () => {
  const source = await readFile(poiMapModule, 'utf8')
  const labelStart = source.indexOf('function markerLabel(')
  const labelEnd = source.indexOf('function removeMarker', labelStart)
  const label = source.slice(labelStart, labelEnd)
  const markerStart = source.indexOf('function createPoiMarker(')
  const markerEnd = source.indexOf('function addClusterLayers', markerStart)
  const marker = source.slice(markerStart, markerEnd)

  assert.notEqual(labelStart, -1)
  assert.match(label, /properties\.name/)
  assert.match(label, /poiLabel\(properties\)/)
  assert.match(label, /properties\.settlement_name/)
  assert.match(source, /setAttribute\('aria-label', markerLabel\(properties\)\)/)
  assert.ok(marker.indexOf("setAttribute('aria-label'") > marker.indexOf('.addTo(map)'))
})
