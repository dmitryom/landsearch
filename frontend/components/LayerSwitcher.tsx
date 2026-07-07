'use client'

import { useState } from 'react'
import { Layers } from 'lucide-react'
import { BASE_LAYERS } from '@/lib/constants'
import maplibregl from 'maplibre-gl'
import { log } from '@/lib/logger'
import { buildVriFillExpr, buildVriBorderExpr } from '@/lib/constants'

function mapSourceExists(map: maplibregl.Map, sourceId: string) {
  try { return !!map.getSource(sourceId) } catch { return false }
}

export default function LayerSwitcher({
  map,
  currentLayer,
  onChange,
}: {
  map: maplibregl.Map | null
  currentLayer: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  const switchLayer = (id: string) => {
    if (!map) return
    const layer = BASE_LAYERS.find(l => l.id === id)
    if (!layer) return
    log('map', 'Switching layer', id)
    onChange(id)
    map.setStyle(layer.style)

    let done = false
    const reinit = () => {
      if (done) return
      done = true
      if (!mapSourceExists(map, 'plots-tiles')) {
        map.addSource('plots-tiles', {
          type: 'vector',
          tiles: [`${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/plots/tiles/{z}/{x}/{y}.mvt`],
          minzoom: 8,
          maxzoom: 18,
        })
        map.addLayer({
          id: 'plots-fill', type: 'fill', source: 'plots-tiles',
          'source-layer': 'plots',
          paint: { 'fill-color': buildVriFillExpr() as any, 'fill-opacity': 0.18, 'fill-outline-color': buildVriBorderExpr() as any },
        })
        map.addLayer({
          id: 'plots-border', type: 'line', source: 'plots-tiles',
          'source-layer': 'plots',
          paint: { 'line-color': buildVriBorderExpr() as any, 'line-width': 2 },
        })
        map.addLayer({
          id: 'plots-points', type: 'circle', source: 'plots-tiles',
          'source-layer': 'plots',
          paint: {
            'circle-color': buildVriFillExpr() as any,
            'circle-radius': 5,
            'circle-stroke-color': buildVriBorderExpr() as any,
            'circle-stroke-width': 1.5,
          },
        })
      }
      log('map', 'Layer switched', id)
    }
    map.once('style.load', reinit)
    setTimeout(reinit, 500)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-white rounded-lg shadow-lg border px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 hover:bg-gray-50"
        title="Подложка карты"
      >
        <Layers className="w-4 h-4" />
        <span className="hidden sm:inline">{BASE_LAYERS.find(l => l.id === currentLayer)?.name || 'Схема'}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border p-1 z-20 min-w-[120px] sm:min-w-[140px] max-h-[60vh] overflow-y-auto">
          {BASE_LAYERS.map((layer) => (
            <button
              key={layer.id}
              onClick={() => { switchLayer(layer.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-2 sm:px-3 py-2 rounded text-xs sm:text-sm ${currentLayer === layer.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <span>{layer.icon}</span>
              <span className="truncate">{layer.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
