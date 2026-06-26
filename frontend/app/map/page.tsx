'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, PlotGeoJSON } from '@/lib/api'

const BASE_LAYERS = [
  {
    id: 'osm',
    name: 'Схема',
    icon: '🗺️',
    style: {
      version: 8 as const,
      sources: {
        osm: {
          type: 'raster' as const,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
    },
  },
  {
    id: 'satellite',
    name: 'Спутник',
    icon: '🛰️',
    style: {
      version: 8 as const,
      sources: {
        esri: {
          type: 'raster' as const,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri',
        },
      },
      layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
    },
  },
  {
    id: 'topo',
    name: 'Топо',
    icon: '🏔️',
    style: {
      version: 8 as const,
      sources: {
        topo: {
          type: 'raster' as const,
          tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenTopoMap',
        },
      },
      layers: [{ id: 'topo', type: 'raster' as const, source: 'topo' }],
    },
  },
  {
    id: 'dark',
    name: 'Тёмная',
    icon: '🌙',
    style: {
      version: 8 as const,
      sources: {
        carto: {
          type: 'raster' as const,
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© CartoDB',
        },
      },
      layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
    },
  },
]

export default function MapPage() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [geoJSON, setGeoJSON] = useState<PlotGeoJSON | null>(null)
  const [filters, setFilters] = useState({ status: '', permitted_use: '' })
  const [baseLayer, setBaseLayer] = useState('osm')
  const [showLayers, setShowLayers] = useState(false)

  useEffect(() => {
    api.plots.geo(filters).then(setGeoJSON)
  }, [filters])

  useEffect(() => {
    if (!container.current) return

    const layer = BASE_LAYERS.find((l) => l.id === baseLayer) || BASE_LAYERS[0]

    const map = new maplibregl.Map({
      container: container.current,
      style: layer.style,
      zoom: 12,
      center: [38.12, 55.57],
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      map.addSource('plots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'plots-fill',
        type: 'fill',
        source: 'plots',
        paint: {
          'fill-color': ['match', ['get', 'status'], 'free', '#22c55e', 'reserved', '#eab308', 'booked', '#f97316', 'sold', '#ef4444', '#22c55e'],
          'fill-opacity': 0.5,
          'fill-outline-color': '#fff',
        },
      })
      map.addLayer({
        id: 'plots-border',
        type: 'line',
        source: 'plots',
        paint: {
          'line-color': '#fff',
          'line-width': 2,
        },
      })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [baseLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoJSON) return
    const source = map.getSource('plots') as maplibregl.GeoJSONSource
    if (source) source.setData(geoJSON as any)
  }, [geoJSON])

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-white border-b px-4 py-2 flex items-center gap-4">
        <a href="/" className="text-blue-600">&larr; На главную</a>
        <h1 className="font-bold">LandSearch — Карта</h1>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="ml-auto border rounded px-2 py-1 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="free">Свободен</option>
          <option value="reserved">В резерве</option>
          <option value="booked">Забронирован</option>
          <option value="sold">Продан</option>
        </select>
        <div className="relative">
          <button
            onClick={() => setShowLayers(!showLayers)}
            className="border rounded px-3 py-1 text-sm flex items-center gap-1 hover:bg-gray-50"
          >
            <span>{BASE_LAYERS.find((l) => l.id === baseLayer)?.icon}</span>
            {BASE_LAYERS.find((l) => l.id === baseLayer)?.name}
          </button>
          {showLayers && (
            <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg p-1 z-20 min-w-[120px]">
              {BASE_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => { setBaseLayer(layer.id); setShowLayers(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
                    baseLayer === layer.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  <span>{layer.icon}</span>
                  <span>{layer.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={container} className="flex-1" />
    </div>
  )
}
