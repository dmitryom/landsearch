import maplibregl from 'maplibre-gl'
import { buildVriFillExpr, buildVriBorderExpr } from './constants'

export const PLOT_TILE_SOURCE_ID = 'plots-tiles'
export const PLOT_TILE_SOURCE_LAYER = 'plots'

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
        'fill-color': buildVriFillExpr() as any,
        'fill-opacity': 0.42,
      },
    })
  }

  if (!hasLayer(map, 'plots-border')) {
    map.addLayer({
      id: 'plots-border',
      type: 'line',
      source: PLOT_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      minzoom: 13,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': buildVriBorderExpr() as any,
        'line-width': 1.8,
        'line-opacity': 0.95,
      },
    })
  }

  if (!hasLayer(map, 'plots-points')) {
    map.addLayer({
      id: 'plots-points',
      type: 'circle',
      source: PLOT_TILE_SOURCE_ID,
      'source-layer': PLOT_TILE_SOURCE_LAYER,
      paint: {
        'circle-color': buildVriFillExpr() as any,
        'circle-radius': 6,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.9,
      },
    })
  }
}
