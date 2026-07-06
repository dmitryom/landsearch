'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '@/lib/api'
import { STATUS_LABELS, VRI_COLORS, VRI_DEFAULT_COLOR, BASE_LAYERS, vriColor } from '@/lib/constants'
import { Filter, Layers, X, Home } from 'lucide-react'
import SearchBar from '@/components/ui/SearchBar'
import FilterPanel from '@/components/ui/FilterPanel'
import PlotPopup from '@/components/ui/PlotPopup'
import LogPanel from '@/components/ui/LogPanel'
import { log } from '@/lib/logger'

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

const VRI_FILL_EXPR = (() => {
  const expr: any[] = ['match', ['get', 'vri_code']]
  for (const [code, color] of Object.entries(VRI_COLORS)) {
    expr.push(code, color)
  }
  expr.push(VRI_DEFAULT_COLOR)
  return expr
})()

const VRI_BORDER_EXPR = (() => {
  // Darker shade for borders (reduce lightness by ~25%)
  const darken = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `#${[r,g,b].map(c => Math.round(c * 0.6).toString(16).padStart(2, '0')).join('')}`
  }
  const expr: any[] = ['match', ['get', 'vri_code']]
  for (const [code, color] of Object.entries(VRI_COLORS)) {
    expr.push(code, darken(color))
  }
  expr.push(darken(VRI_DEFAULT_COLOR))
  return expr
})()

function detectWebGL(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return 'NO_WEBGL'
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown'
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown'
    return `OK renderer=${renderer} vendor=${vendor}`
  } catch (e: any) {
    return `ERROR: ${e.message}`
  }
}

export default function HomePage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapReadyRef = useRef(false)
  const loadIdRef = useRef(0)
  const [plotsList, setPlotsList] = useState<any[]>([])
  const [selectedPlot, setSelectedPlot] = useState<any>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(true)
  const [baseLayer, setBaseLayer] = useState('osm')
  const [showLayers, setShowLayers] = useState(false)
  const [sliderOpen, setSliderOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapInit, setMapInit] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)
  const layerChanging = useRef(false)

  const loadData = useCallback(async (f: Record<string, string>) => {
    const id = ++loadIdRef.current
    setLoading(true)
    setError(null)
    log('data', 'Запрос данных', JSON.stringify(f))
    const t0 = performance.now()
    try {
      const list = await api.plots.list({ ...f, page_size: '200' })
      if (id !== loadIdRef.current) return
      log('data', `Данные загружены за ${Math.round(performance.now() - t0)}ms`, `plots: ${list.total} total`)
      setPlotsList(list.items)
    } catch (e: any) {
      if (id === loadIdRef.current) {
        log('error', 'Ошибка загрузки данных', `${e.message}\n${e.stack}`)
        setError('Не удалось загрузить данные. Проверьте подключение к серверу.')
      }
    } finally {
      if (id === loadIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(filters)
  }, [filters, loadData])

  const tileUrl = `${API}/plots/tiles/{z}/{x}/{y}.mvt`

  const initMapLayers = (map: maplibregl.Map) => {
    if (mapSourceExists(map, 'plots-tiles')) return
    log('map', 'Добавление MVT tile слоёв')
    map.addSource('plots-tiles', {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 8,
      maxzoom: 18,
    })
    map.addLayer({
      id: 'plots-fill', type: 'fill', source: 'plots-tiles',
      'source-layer': 'plots',
      paint: { 'fill-color': VRI_FILL_EXPR as any, 'fill-opacity': 0.18, 'fill-outline-color': VRI_BORDER_EXPR as any },
    })
    map.addLayer({
      id: 'plots-border', type: 'line', source: 'plots-tiles',
      'source-layer': 'plots',
      paint: { 'line-color': VRI_BORDER_EXPR as any, 'line-width': 2 },
    })
    map.addLayer({
      id: 'plots-points', type: 'circle', source: 'plots-tiles',
      'source-layer': 'plots',
      paint: {
        'circle-color': VRI_FILL_EXPR as any,
        'circle-radius': 5,
        'circle-stroke-color': VRI_BORDER_EXPR as any,
        'circle-stroke-width': 1.5,
      },
    })
    map.on('click', 'plots-fill', (e) => {
      if (e.features?.[0]) setSelectedPlot(e.features[0].properties)
    })
    map.on('click', 'plots-points', (e) => {
      if (e.features?.[0]) setSelectedPlot(e.features[0].properties)
    })
    map.on('mouseenter', 'plots-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'plots-fill', () => { map.getCanvas().style.cursor = '' })
    map.on('mouseenter', 'plots-points', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'plots-points', () => { map.getCanvas().style.cursor = '' })
  }

  useEffect(() => {
    log('render', 'HomePage mounted')
    log('webgl', 'WebGL check', detectWebGL())
    log('render', 'Container ref', mapContainer.current ? 'EXISTS' : 'NULL')
    log('render', 'MapLibre version', (maplibregl as any).version || 'unknown')

    const ua = navigator.userAgent
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua)
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    log('render', 'Browser', `${isSafari ? 'Safari' : isIOS ? 'iOS' : 'Other'} — ${ua.slice(0, 80)}`)
    log('render', 'Screen', `${window.innerWidth}x${window.innerHeight}, dpr=${window.devicePixelRatio}`)
  }, [])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      log('map', 'Init skipped', !mapContainer.current ? 'no container' : 'map already exists')
      return
    }

    let mounted = true
    log('map', 'Начало инициализации карты')

    try {
      const container = mapContainer.current
      log('map', 'Container尺寸', `${container.clientWidth}x${container.clientHeight}`)

      const map = new maplibregl.Map({
        container,
        style: BASE_LAYERS[0]!.style,
        center: [38.12, 55.57],
        zoom: 12,
      })

      log('map', 'Map object created')

      map.on('error', (e) => {
        const detail = e as any
        log('error', 'MapLibre error', `${e.error?.message || 'unknown'}\nsource=${detail.sourceId || 'none'}\ntile=${detail.tile?.url || 'none'}`)
      })

      map.on('styleimagemissing', (e) => {
        log('map', 'Style image missing', e.id)
      })

      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      map.addControl(new maplibregl.FullscreenControl(), 'top-right')
      log('map', 'Controls added')

      map.on('load', () => {
        if (!mounted) return
        const elapsed = Math.round(performance.now())
        log('map', `Map LOAD event fired after ${elapsed}ms`)
        mapReadyRef.current = true
        initMapLayers(map)
        setMapInit(true)
        log('map', 'mapInit set to true')
      })

      map.on('idle', () => {
        log('map', 'Map IDLE — tiles rendered')
      })

      map.on('sourcedata', (e) => {
        if (e.isSourceLoaded) {
          log('map', 'Source loaded', e.sourceId)
        }
      })

      map.on('moveend', () => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        log('map', `Map moved: center=[${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}] zoom=${zoom.toFixed(1)}`)
      })

      mapRef.current = map
      log('map', 'mapRef set, waiting for load event...')

      const fallback = setTimeout(() => {
        if (mounted && !mapReadyRef.current) {
          log('error', 'TIMEOUT: map.on(load) не сработал за 15 сек')
          log('map', 'Map state', `loaded=${map.loaded()} style.loaded=${map.isStyleLoaded()}`)
          setMapInit(true)
        }
      }, 15000)

      return () => {
        mounted = false
        clearTimeout(fallback)
        map.remove()
        mapRef.current = null
        mapReadyRef.current = false
        setMapInit(false)
      }
    } catch (e: any) {
      log('error', 'Map init CRASH', `${e.message}\n${e.stack}`)
      mounted = false
      setMapInit(true)
    }
  }, [])



  const changeLayer = (id: string) => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    const layer = BASE_LAYERS.find((l) => l.id === id)
    if (!layer) return
    log('map', 'Switching layer', id)
    layerChanging.current = true
    setBaseLayer(id)
    map.setStyle(layer.style)

    let done = false
    const reinit = () => {
      if (done) return
      done = true
      if (!mapSourceExists(map, 'plots-tiles')) {
        initMapLayers(map)
      }
      layerChanging.current = false
      log('map', 'Layer switched', id)
    }

    map.once('style.load', reinit)
    setTimeout(reinit, 500)
  }

  const mapSourceExists = (map: maplibregl.Map, sourceId: string) => {
    try {
      return !!map.getSource(sourceId)
    } catch {
      return false
    }
  }

  const handleSearch = async (q: string) => {
    if (!q) { setFilters({}); return }
    const results = await api.search.suggest(q)
    if (results.results.length > 0) {
      setFilters((prev) => ({ ...prev, query: q }))
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
            <Home className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">LandSearch</h1>
        </div>
        <div className="flex-1 max-w-xl">
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <div className="hidden md:flex items-center gap-1 text-gray-500">
            <span className="text-green-600 font-semibold">{freeCount}</span>
            <span>свободно</span>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="Фильтры">
            <Filter className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="/auth/login" className="px-3 sm:px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-xs sm:text-sm">Войти</a>
            <a href="/admin" className="px-3 sm:px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs sm:text-sm">Админка</a>
          </div>
        </div>
      </header>

      <div className="md:hidden px-4 py-2 border-b border-gray-200 bg-white">
        <SearchBar onSearch={handleSearch} />
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {showFilters && <div className="hidden md:block"><FilterPanel filters={filters} onChange={setFilters} /></div>}

        {showFilters && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowFilters(false)} />
            <div className="relative w-72 max-w-[85vw] bg-white shadow-xl">
              <div className="absolute top-2 right-2 z-10">
                <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
          </div>
        )}

        <main className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 z-0">
            <div ref={mapContainer} className="w-full h-full" />
          </div>

          {!mapInit && (
            <div className="absolute inset-0 z-30 bg-gray-100 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Загрузка карты...</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 text-sm text-gray-600 border flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              Загрузка данных...
            </div>
          )}
          {error && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-red-50 border border-red-200 rounded-lg shadow-lg px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          {selectedPlot && <PlotPopup plot={selectedPlot} onClose={() => setSelectedPlot(null)} />}

          <div className="absolute top-4 right-12 sm:right-16 z-10">
            <div className="relative">
              <button onClick={() => setShowLayers(!showLayers)}
                className="bg-white rounded-lg shadow-lg border px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 hover:bg-gray-50" title="Подложка карты">
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">{BASE_LAYERS.find((l) => l.id === baseLayer)?.name || 'Схема'}</span>
              </button>
              {showLayers && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border p-1 z-20 min-w-[120px] sm:min-w-[140px] max-h-[60vh] overflow-y-auto">
                  {BASE_LAYERS.map((layer) => (
                    <button key={layer.id}
                      onClick={() => { changeLayer(layer.id); setShowLayers(false) }}
                      className={`w-full flex items-center gap-2 px-2 sm:px-3 py-2 rounded text-xs sm:text-sm ${baseLayer === layer.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}>
                      <span>{layer.icon}</span>
                      <span className="truncate">{layer.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 left-2 sm:left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-3 text-xs sm:text-sm z-10 border max-w-[280px]">
            <div className="text-[10px] font-semibold text-gray-500 mb-1.5">ВРИ</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {Object.entries(VRI_COLORS).slice(0, 10).map(([code, color]) => (
                <div key={code} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-600 text-[10px] whitespace-nowrap">{code}</span>
                </div>
              ))}
            </div>
          </div>

          {plotsList.length > 0 && (
            <div className="hidden sm:block absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-10 border text-xs sm:text-sm text-gray-600">
              {plotsList.length} участков · {(totalArea / 10000).toFixed(1)} га · {new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽
            </div>
          )}

          <div className={`absolute left-0 right-0 bottom-0 z-10 bg-white border-t shadow-2xl transition-transform duration-300 ease-out ${sliderOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}
            style={{ maxHeight: '55vh' }}>
            <button onClick={() => setSliderOpen(!sliderOpen)}
              className="w-full flex items-center justify-center gap-2 py-3 border-b cursor-pointer hover:bg-gray-50">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </button>
            <div className="px-4 pb-2 flex items-center justify-between">
              <h3 className="font-semibold text-xs sm:text-sm">Участки <span className="text-gray-400 font-normal">({plotsList.length})</span></h3>
              <div className="flex gap-2 text-[10px] sm:text-xs text-gray-500">
                <span>{(totalArea / 10000).toFixed(1)} га</span>
                <span>·</span>
                <span>{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</span>
              </div>
            </div>
            <div ref={sliderRef} className="overflow-x-auto overflow-y-hidden pb-4 px-4">
              <div className="flex gap-3" style={{ width: 'max-content' }}>
                {plotsList.map((p) => (
                  <div key={p.id}
                    className="w-56 sm:w-64 shrink-0 bg-white rounded-xl border hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => { setSelectedPlot(p); flyToPlot(p) }}>
                    <div className="p-3">
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-xs sm:text-sm truncate">{p.title || p.cadastral_number}</p>
                          <p className="text-[10px] sm:text-xs text-gray-400 font-mono truncate">{p.cadastral_number}</p>
                        </div>
                        <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          p.status === 'free' ? 'bg-green-100 text-green-700' :
                          p.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' :
                          p.status === 'booked' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>{STATUS_LABELS[p.status]}</span>
                      </div>
                      {p.address && <p className="text-[10px] sm:text-xs text-gray-500 truncate mb-1.5">{p.address}</p>}
                      <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 mb-2">
                        {p.area_m2 && <span>{(p.area_m2 / 100).toFixed(1)} сот.</span>}
                        {p.permitted_use && <><span>·</span><span className="truncate flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: vriColor(p.permitted_use) }} />{p.permitted_use}</span></>}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm sm:text-base font-bold text-gray-900">
                          {p.price ? `${new Intl.NumberFormat('ru-RU').format(p.price)} ₽` : '—'}
                        </p>
                        <a href={`/plots/${p.id}`} className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={(e) => e.stopPropagation()}>
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

      <LogPanel />
    </div>
  )
}
