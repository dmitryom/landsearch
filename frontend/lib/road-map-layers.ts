import maplibregl from 'maplibre-gl'

export const ROAD_SOURCE_ID = 'osm-roads'
export const ROAD_TILEJSON_URL = '/tiles/roads/tiles.json'

export const ROAD_LAYER_IDS = [
  'osm-roads-major-casing',
  'osm-roads-major-surface',
  'osm-roads-local-casing',
  'osm-roads-local-surface',
  'osm-roads-track-casing',
  'osm-roads-track-surface',
] as const

const ROAD_CASING_COLOR = '#4B5563'
const ROAD_SURFACE_COLOR = '#D9DEE5'
const ROAD_ATTRIBUTION = '© OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap'

const majorRoadFilter: maplibregl.FilterSpecification = [
  'in',
  ['get', 'class'],
  ['literal', ['motorway', 'trunk', 'primary', 'secondary']],
]

const localRoadFilter: maplibregl.FilterSpecification = [
  'in',
  ['get', 'class'],
  ['literal', ['tertiary', 'minor', 'street', 'street_limited', 'service']],
]

const trackRoadFilter: maplibregl.FilterSpecification = [
  'in',
  ['get', 'class'],
  ['literal', ['track']],
]

const roadLayers: maplibregl.LineLayerSpecification[] = [
  {
    id: ROAD_LAYER_IDS[0],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 9,
    filter: majorRoadFilter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_CASING_COLOR,
      'line-opacity': 0.9,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 12, 4, 16, 13, 20, 24],
    },
  },
  {
    id: ROAD_LAYER_IDS[1],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 9,
    filter: majorRoadFilter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_SURFACE_COLOR,
      'line-opacity': 0.96,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 12, 2.5, 16, 10, 20, 19],
    },
  },
  {
    id: ROAD_LAYER_IDS[2],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 11,
    filter: localRoadFilter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_CASING_COLOR,
      'line-opacity': 0.88,
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 13, 2.5, 16, 9, 20, 16],
    },
  },
  {
    id: ROAD_LAYER_IDS[3],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 11,
    filter: localRoadFilter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_SURFACE_COLOR,
      'line-opacity': 0.95,
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 13, 1.3, 16, 6.5, 20, 12],
    },
  },
  {
    id: ROAD_LAYER_IDS[4],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 13,
    filter: trackRoadFilter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_CASING_COLOR,
      'line-opacity': 0.75,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 16, 5, 20, 10],
    },
  },
  {
    id: ROAD_LAYER_IDS[5],
    type: 'line',
    source: ROAD_SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 13,
    filter: trackRoadFilter,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': ROAD_SURFACE_COLOR,
      'line-opacity': 0.92,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 16, 3, 20, 7],
      'line-dasharray': [1.5, 1],
    },
  },
]

function findLabelLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.id.toLowerCase().includes('label'))?.id
}

export function setRoadLayerVisibility(map: maplibregl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none'
  ROAD_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  })
}

export function addRoadLayers(map: maplibregl.Map, visible = true, beforeLayerId?: string): void {
  if (!map.getSource(ROAD_SOURCE_ID)) {
    map.addSource(ROAD_SOURCE_ID, {
      type: 'vector',
      url: ROAD_TILEJSON_URL,
      attribution: ROAD_ATTRIBUTION,
      minzoom: 0,
      maxzoom: 14,
    })
  }

  const beforeId = beforeLayerId && map.getLayer(beforeLayerId)
    ? beforeLayerId
    : findLabelLayerId(map)
  roadLayers.forEach((layer) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId)
  })
  if (beforeId) {
    ROAD_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.moveLayer(layerId, beforeId)
    })
  }
  setRoadLayerVisibility(map, visible)
}
