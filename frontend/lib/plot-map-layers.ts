import maplibregl from 'maplibre-gl'
import { buildStatusFillExpr, MAP_LABEL_FONT } from './constants'
import { buildNspdCadastreTileUrl, buildPlotTileUrl, NSPD_CADASTRAL_LAYER_IDS, TATARSTAN_REGION } from './map-tiles'

export const PLOT_TILE_SOURCE_ID = 'plots-tiles'
export const PLOT_TILE_SOURCE_LAYER = 'plots'
export const PLOT_POINT_FALLBACK_LAYER_ID = 'plots-point-fallback'
export const PLOT_CAD_UNIT_LABEL_LAYER_ID = 'plots-cad-unit-labels'
export const PLOT_CAD_NUMBER_LABEL_LAYER_ID = 'plots-cad-number-labels'
export const TATARSTAN_TILE_SOURCE_ID = 'tatarstan-cadastre-tiles'
export const TATARSTAN_TILE_LAYER_ID = 'tatarstan-cadastre-border'
export const TATARSTAN_CAD_UNIT_LABEL_LAYER_ID = 'tatarstan-cadastre-unit-labels'
export const TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID = 'tatarstan-cadastre-number-labels'

export const NSPD_CADASTRAL_WMS_LAYERS = NSPD_CADASTRAL_LAYER_IDS.map((layerId, index) => ({
  layerId,
  sourceId: `nspd-cadastre-${layerId}`,
  mapLayerId: `nspd-cadastre-${layerId}-raster`,
  opacity: index === 0 ? 0.34 : 0.24,
}))

export const NSPD_LAYER_KEYS = {
  plots: 36048,
  buildings: 36049,
  structures: 36328,
  unfinished: 36329,
} as const

export type NspdLayerKey = keyof typeof NSPD_LAYER_KEYS
export type NspdLayerVisibility = Record<NspdLayerKey, boolean>

export const DEFAULT_NSPD_LAYER_VISIBILITY: NspdLayerVisibility = {
  plots: true,
  buildings: true,
  structures: true,
  unfinished: true,
}

type PlotTileSource = maplibregl.VectorTileSource & { setTiles?: (tiles: string[]) => void }

function getPlotTileSource(map: maplibregl.Map): PlotTileSource | undefined {
  try {
    return map.getSource(PLOT_TILE_SOURCE_ID) as PlotTileSource | undefined
  } catch {
    return undefined
  }
}

function hasLayer(map: maplibregl.Map, layerId: string): boolean {
  try {
    return !!map.getLayer(layerId)
  } catch {
    return false
  }
}

function addCadastralLabelLayers(map: maplibregl.Map, sourceId: string, unitLayerId: string, numberLayerId: string): void {
  if (!hasLayer(map, unitLayerId)) {
    map.addLayer({
      id: unitLayerId,
      type: 'symbol',
      source: sourceId,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 12.5,
      maxzoom: 14.5,
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'cad_unit'],
        'text-font': [MAP_LABEL_FONT],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 9, 14.5, 10.5] as any,
        'text-anchor': 'center',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#f8fafc',
        'text-halo-color': '#0f172a',
        'text-halo-width': 1.2,
        'text-halo-blur': 0.15,
        'text-opacity': 0.9,
      },
    })
  }

  if (!hasLayer(map, numberLayerId)) {
    map.addLayer({
      id: numberLayerId,
      type: 'symbol',
      source: sourceId,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 14.5,
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'cad_num_short'],
        'text-font': [MAP_LABEL_FONT],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 9, 18, 12] as any,
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#111827',
        'text-halo-width': 1.35,
        'text-halo-blur': 0.15,
        'text-opacity': 0.96,
      },
    })
  }
}

export function updatePlotTileUrl(map: maplibregl.Map, tileUrl: string): boolean {
  const source = getPlotTileSource(map)
  if (!source || typeof source.setTiles !== 'function') return false

  source.setTiles([tileUrl])
  map.triggerRepaint()
  return true
}

export function addPlotTileLayers(map: maplibregl.Map, tileUrl: string): void {
  if (!getPlotTileSource(map)) {
    map.addSource(PLOT_TILE_SOURCE_ID, {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 8,
      maxzoom: 18,
    })
  } else {
    updatePlotTileUrl(map, tileUrl)
  }

  if (!hasLayer(map, 'plots-fill')) {
    map.addLayer({
      id: 'plots-fill',
      type: 'fill',
      source: PLOT_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      paint: {
        'fill-color': buildStatusFillExpr() as any,
        'fill-opacity': 0.55,
      },
    })
  }

  if (!hasLayer(map, 'plots-border')) {
    map.addLayer({
      id: 'plots-border',
      type: 'line',
      source: PLOT_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 11,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 1.8, 18, 2.2] as any,
        'line-opacity': 0.95,
      },
    })
  }

  if (!hasLayer(map, PLOT_POINT_FALLBACK_LAYER_ID)) {
    map.addLayer({
      id: PLOT_POINT_FALLBACK_LAYER_ID,
      type: 'circle',
      source: PLOT_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 8,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': buildStatusFillExpr() as any,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7, 18, 10] as any,
        'circle-opacity': 0.9,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.8,
      },
    })
  }

  addCadastralLabelLayers(
    map,
    PLOT_TILE_SOURCE_ID,
    PLOT_CAD_UNIT_LABEL_LAYER_ID,
    PLOT_CAD_NUMBER_LABEL_LAYER_ID,
  )
}

export function setTatarstanCadastreLayer(
  map: maplibregl.Map,
  enabled: boolean,
  visibility: NspdLayerVisibility = DEFAULT_NSPD_LAYER_VISIBILITY,
  opacity = 1,
): void {
  if (!map.isStyleLoaded()) return

  if (!enabled) {
    for (const layer of NSPD_CADASTRAL_WMS_LAYERS) {
      if (hasLayer(map, layer.mapLayerId)) map.removeLayer(layer.mapLayerId)
      if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId)
    }
    if (map.getLayer(TATARSTAN_TILE_LAYER_ID)) map.removeLayer(TATARSTAN_TILE_LAYER_ID)
    if (map.getLayer(TATARSTAN_CAD_UNIT_LABEL_LAYER_ID)) map.removeLayer(TATARSTAN_CAD_UNIT_LABEL_LAYER_ID)
    if (map.getLayer(TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID)) map.removeLayer(TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID)
    if (map.getSource(TATARSTAN_TILE_SOURCE_ID)) map.removeSource(TATARSTAN_TILE_SOURCE_ID)
    return
  }

  for (const layer of NSPD_CADASTRAL_WMS_LAYERS) {
    const layerKey = (Object.entries(NSPD_LAYER_KEYS).find(([, id]) => id === layer.layerId)?.[0] || 'plots') as NspdLayerKey
    if (!visibility[layerKey]) {
      if (hasLayer(map, layer.mapLayerId)) map.removeLayer(layer.mapLayerId)
      if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId)
      continue
    }
    const isLandParcelLayer = layer.layerId === 36048
    const minzoom = isLandParcelLayer ? 8 : 12
    if (!map.getSource(layer.sourceId)) {
      map.addSource(layer.sourceId, {
        type: 'raster',
        tiles: [buildNspdCadastreTileUrl(layer.layerId)],
        tileSize: 256,
        minzoom,
        maxzoom: 18,
      })
    }
    if (!hasLayer(map, layer.mapLayerId)) {
      const rasterLayer = {
        id: layer.mapLayerId,
        type: 'raster' as const,
        source: layer.sourceId,
        minzoom,
        paint: { 'raster-opacity': layer.opacity * opacity },
      }
      if (map.getLayer('plots-fill')) map.addLayer(rasterLayer, 'plots-fill')
      else map.addLayer(rasterLayer)
    } else {
      map.setPaintProperty(layer.mapLayerId, 'raster-opacity', layer.opacity * opacity)
    }
  }

  const tileUrl = buildPlotTileUrl({ region: TATARSTAN_REGION })
  const source = map.getSource(TATARSTAN_TILE_SOURCE_ID) as PlotTileSource | undefined
  if (source && typeof source.setTiles === 'function') {
    source.setTiles([tileUrl])
  } else if (!source) {
    map.addSource(TATARSTAN_TILE_SOURCE_ID, {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 9,
      maxzoom: 18,
    })
  }

  if (visibility.plots && !map.getLayer(TATARSTAN_TILE_LAYER_ID)) {
    map.addLayer({
      id: TATARSTAN_TILE_LAYER_ID,
      type: 'line',
      source: TATARSTAN_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 9,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.45, 12, 0.8, 16, 1.6] as any,
        'line-opacity': 0.78,
      },
    })
  }

  if (!visibility.plots) {
    if (map.getLayer(TATARSTAN_TILE_LAYER_ID)) map.removeLayer(TATARSTAN_TILE_LAYER_ID)
    if (map.getLayer(TATARSTAN_CAD_UNIT_LABEL_LAYER_ID)) map.removeLayer(TATARSTAN_CAD_UNIT_LABEL_LAYER_ID)
    if (map.getLayer(TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID)) map.removeLayer(TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID)
  }

  if (visibility.plots) {
    addCadastralLabelLayers(
      map,
      TATARSTAN_TILE_SOURCE_ID,
      TATARSTAN_CAD_UNIT_LABEL_LAYER_ID,
      TATARSTAN_CAD_NUMBER_LABEL_LAYER_ID,
    )
  }
}
