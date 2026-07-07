'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { api } from '@/lib/api'
import { STATUS_LABELS, VRI_COLORS, VRI_DEFAULT_COLOR, BASE_LAYERS, vriColor } from '@/lib/constants'
import { Filter, Home } from 'lucide-react'
import SearchBar from '@/components/ui/SearchBar'
import FilterPanel from '@/components/ui/FilterPanel'
import PlotPopup from '@/components/ui/PlotPopup'
import LogPanel from '@/components/ui/LogPanel'
import MapView from '@/components/MapView'
import LayerSwitcher from '@/components/LayerSwitcher'
import VriLegend from '@/components/VriLegend'
import PlotCardList from '@/components/PlotCardList'
import { log } from '@/lib/logger'

export default function HomePage() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadIdRef = useRef(0)
  const [plotsList, setPlotsList] = useState<any[]>([])
  const [selectedPlot, setSelectedPlot] = useState<any>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(true)
  const [baseLayer, setBaseLayer] = useState('osm')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapInit, setMapInit] = useState(false)

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

  useEffect(() => { loadData(filters) }, [filters, loadData])

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

  const handlePlotClick = (props: Record<string, any>) => {
    setSelectedPlot(props)
  }

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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
          </div>
        )}

        <main className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 z-0">
            <MapView
              mapRef={mapRef}
              onMapReady={() => setMapInit(true)}
              onPlotClick={handlePlotClick}
            />
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
            <LayerSwitcher map={mapRef.current} currentLayer={baseLayer} onChange={setBaseLayer} />
          </div>

          <VriLegend />

          {plotsList.length > 0 && (
            <div className="hidden sm:block absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 z-20 border text-xs sm:text-sm text-gray-600">
              {plotsList.length} участков · {(plotsList.reduce((s: number, p: any) => s + (p.area_m2 || 0), 0) / 10000).toFixed(1)} га · {new Intl.NumberFormat('ru-RU').format(plotsList.reduce((s: number, p: any) => s + (p.price || 0), 0))} ₽
            </div>
          )}

          <PlotCardList plots={plotsList} onSelect={setSelectedPlot} onFlyTo={flyToPlot} />
        </main>
      </div>

      <LogPanel />
    </div>
  )
}
