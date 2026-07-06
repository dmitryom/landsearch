'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, PlotGeoJSON } from '@/lib/api'
import { BASE_LAYERS } from '@/lib/constants'

export default function MapPage() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapReady = useRef(false)
  const [geoJSON, setGeoJSON] = useState<PlotGeoJSON | null>(null)
  const [filters, setFilters] = useState({ status: '', permitted_use: '' })
  const [baseLayer, setBaseLayer] = useState('osm')
  const [showLayers, setShowLayers] = useState(false)

  const initLayers = (map: maplibregl.Map) => {
    if (map.getSource('plots')) return
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
  }

  useEffect(() => {
    api.plots.geo(filters).then(setGeoJSON)
  }, [filters])

  useEffect(() => {
    if (!container.current) return

    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_LAYERS[0]!.style,
      zoom: 12,
      center: [38.12, 55.57],
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      mapReady.current = true
      initLayers(map)
      if (geoJSON) {
        const source = map.getSource('plots') as maplibregl.GeoJSONSource
        if (source) source.setData(geoJSON as any)
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; mapReady.current = false }
  }, [])

  const changeLayer = (id: string) => {
    const map = mapRef.current
    if (!map || !mapReady.current) return
    const layer = BASE_LAYERS.find((l) => l.id === id)
    if (!layer) return
    setBaseLayer(id)
    map.setStyle(layer.style)
    map.once('style.load', () => {
      initLayers(map)
      if (geoJSON) {
        const source = map.getSource('plots') as maplibregl.GeoJSONSource
        if (source) source.setData(geoJSON as any)
      }
    })
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoJSON || !mapReady.current) return
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
                  onClick={() => { changeLayer(layer.id); setShowLayers(false) }}
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
