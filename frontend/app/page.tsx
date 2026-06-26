'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, PlotGeoJSON } from '@/lib/api'
import SearchBar from '@/components/ui/SearchBar'
import FilterPanel from '@/components/ui/FilterPanel'
import PlotPopup from '@/components/ui/PlotPopup'

const STATUS_COLORS: Record<string, string> = {
  free: '#22c55e',
  reserved: '#eab308',
  booked: '#f97316',
  sold: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  free: 'Свободен',
  reserved: 'В резерве',
  booked: 'Забронирован',
  sold: 'Продан',
}

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

export default function HomePage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [geoJSON, setGeoJSON] = useState<PlotGeoJSON | null>(null)
  const [plotsList, setPlotsList] = useState<any[]>([])
  const [selectedPlot, setSelectedPlot] = useState<any>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(true)
  const [baseLayer, setBaseLayer] = useState('osm')
  const [showLayers, setShowLayers] = useState(false)
  const [sliderOpen, setSliderOpen] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  const geoJSONRef = useRef<PlotGeoJSON | null>(null)
  const mapLoadedRef = useRef(false)

  const loadData = useCallback(async (f: Record<string, string>) => {
    try {
      const [geo, list] = await Promise.all([
        api.plots.geo(f),
        api.plots.list({ ...f, page_size: '200' }),
      ])
      setGeoJSON(geo)
      geoJSONRef.current = geo
      setPlotsList(list.items)
      if (mapLoadedRef.current && mapRef.current) {
        const source = mapRef.current.getSource('plots') as maplibregl.GeoJSONSource
        if (source) source.setData(geo as any)
      }
    } catch (e) {
      console.error('Failed to load data', e)
    }
  }, [])

  useEffect(() => {
    loadData(filters)
  }, [filters, loadData])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const layer = BASE_LAYERS.find((l) => l.id === baseLayer) || BASE_LAYERS[0]

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: layer.style,
      center: [38.12, 55.57],
      zoom: 12,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      mapLoadedRef.current = true
      map.addSource('plots', {
        type: 'geojson',
        data: geoJSONRef.current || { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'plots-fill',
        type: 'fill',
        source: 'plots',
        paint: {
          'fill-color': ['match',
            ['get', 'status'],
            'free', '#22c55e',
            'reserved', '#eab308',
            'booked', '#f97316',
            'sold', '#ef4444',
            '#22c55e'
          ],
          'fill-opacity': 0.45,
          'fill-outline-color': ['match',
            ['get', 'status'],
            'free', '#16a34a',
            'reserved', '#ca8a04',
            'booked', '#ea580c',
            'sold', '#dc2626',
            '#16a34a'
          ],
        },
      })

      map.addLayer({
        id: 'plots-border',
        type: 'line',
        source: 'plots',
        paint: {
          'line-color': ['match',
            ['get', 'status'],
            'free', '#16a34a',
            'reserved', '#ca8a04',
            'booked', '#ea580c',
            'sold', '#dc2626',
            '#16a34a'
          ],
          'line-width': 2.5,
        },
      })

      map.on('click', 'plots-fill', (e) => {
        if (e.features?.[0]) {
          setSelectedPlot(e.features[0].properties)
        }
      })

      map.on('mouseenter', 'plots-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'plots-fill', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [baseLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoJSON) return
    const source = map.getSource('plots') as maplibregl.GeoJSONSource
    if (source) {
      source.setData(geoJSON as any)
    }

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (geoJSON.features.length > 0) {
      geoJSON.features.forEach((f: any) => {
        const coords = f.geometry?.coordinates?.[0]
        if (!coords?.length) return
        const center = coords.reduce(
          (acc: number[], c: number[]) => [acc[0] + c[0] / coords.length, acc[1] + c[1] / coords.length],
          [0, 0]
        )
        const el = document.createElement('div')
        el.className = 'w-4 h-4 rounded-full border-2 border-white shadow-md'
        el.style.backgroundColor = STATUS_COLORS[f.properties?.status] || '#22c55e'
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(center as [number, number])
          .addTo(map)
        markersRef.current.push(marker)
      })
    }
  }, [geoJSON])

  const handleSearch = async (q: string) => {
    if (!q) { setFilters({}); return }
    const results = await api.search.suggest(q)
    if (results.results.length > 0) {
      setFilters({ query: q })
    }
  }

  const flyToPlot = (plot: any) => {
    const map = mapRef.current
    if (!map || !plot.center_lng || !plot.center_lat) return
    map.flyTo({ center: [plot.center_lng, plot.center_lat], zoom: 15 })
  }

  const totalArea = plotsList.reduce((s, p) => s + (p.area_m2 || 0), 0)
  const totalPrice = plotsList.reduce((s, p) => s + (p.price || 0), 0)
  const freeCount = plotsList.filter(p => p.status === 'free').length

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 z-20 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">LandSearch</h1>
        </div>

        <div className="flex-1 max-w-xl">
          <SearchBar onSearch={handleSearch} />
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="hidden md:flex items-center gap-1 text-gray-500">
            <span className="text-green-600 font-semibold">{freeCount}</span>
            <span>свободно</span>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="Фильтры"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <a href="/auth/login" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">Войти</a>
            <a href="/admin" className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Админка</a>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 0, minHeight: 0 }}>
        {showFilters && (
          <FilterPanel filters={filters} onChange={setFilters} />
        )}

        <main className="flex-1 min-h-0 relative">
          <div ref={mapContainer} className="absolute inset-0 z-0" />

          {selectedPlot && (
            <PlotPopup plot={selectedPlot} onClose={() => setSelectedPlot(null)} />
          )}

          <div className="absolute top-4 right-16 z-10">
            <div className="relative">
              <button
                onClick={() => setShowLayers(!showLayers)}
                className="bg-white rounded-lg shadow-lg border px-3 py-2 text-sm font-medium flex items-center gap-2 hover:bg-gray-50"
                title="Подложка карты"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {BASE_LAYERS.find((l) => l.id === baseLayer)?.name}
              </button>

              {showLayers && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border p-1 z-20 min-w-[140px]">
                  {BASE_LAYERS.map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => { setBaseLayer(layer.id); setShowLayers(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm ${
                        baseLayer === layer.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>{layer.icon}</span>
                      <span>{layer.name}</span>
                      {baseLayer === layer.id && (
                        <svg className="w-4 h-4 ml-auto text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 text-sm z-10 border">
            <div className="flex gap-4">
              {Object.entries(STATUS_COLORS).map(([key, color]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
                  <span className="text-gray-600 text-xs">{STATUS_LABELS[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {plotsList.length > 0 && (
            <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-10 border text-sm text-gray-600">
              {plotsList.length} участков · {(totalArea / 10000).toFixed(1)} га · {new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽
            </div>
          )}

          <div
            className={`absolute left-0 right-0 z-10 bg-white border-t shadow-2xl transition-transform duration-300 ease-out ${
              sliderOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'
            }`}
            style={{ maxHeight: '55vh' }}
          >
            <button
              onClick={() => setSliderOpen(!sliderOpen)}
              className="w-full flex items-center justify-center gap-2 py-3 border-b cursor-pointer hover:bg-gray-50"
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </button>

            <div className="px-4 pb-2 flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Участки <span className="text-gray-400 font-normal">({plotsList.length})</span>
              </h3>
              <div className="flex gap-2 text-xs text-gray-500">
                <span>{(totalArea / 10000).toFixed(1)} га</span>
                <span>·</span>
                <span>{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</span>
              </div>
            </div>

            <div ref={sliderRef} className="overflow-x-auto overflow-y-hidden pb-4 px-4">
              <div className="flex gap-3" style={{ width: 'max-content' }}>
                {plotsList.map((p) => (
                  <div
                    key={p.id}
                    className="w-64 shrink-0 bg-white rounded-xl border hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedPlot(p)
                      flyToPlot(p)
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.title || p.cadastral_number}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.cadastral_number}</p>
                        </div>
                        <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          p.status === 'free' ? 'bg-green-100 text-green-700' :
                          p.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' :
                          p.status === 'booked' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>{STATUS_LABELS[p.status]}</span>
                      </div>

                      {p.address && (
                        <p className="text-xs text-gray-500 truncate mb-1.5">{p.address}</p>
                      )}

                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                        {p.area_m2 && <span>{(p.area_m2 / 100).toFixed(1)} сот.</span>}
                        {p.permitted_use && (
                          <>
                            <span>·</span>
                            <span className="truncate">{p.permitted_use}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-base font-bold text-gray-900">
                          {p.price ? `${new Intl.NumberFormat('ru-RU').format(p.price)} ₽` : '—'}
                        </p>
                        <a
                          href={`/plots/${p.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Подробнее →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
