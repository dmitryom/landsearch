'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type maplibregl from 'maplibre-gl'
import { api } from '@/lib/api'
import type { Plot, Settlement } from '@/lib/api'
import { DEFAULT_BASE_LAYER_ID } from '@/lib/constants'
import { Filter, MapPinned } from 'lucide-react'
import SearchBar, { type SearchRequest } from '@/components/ui/SearchBar'
import FilterPanel from '@/components/ui/FilterPanel'
import PlotPopup from '@/components/ui/PlotPopup'
import LogPanel from '@/components/ui/LogPanel'
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
const LayerSwitcher = dynamic(() => import('@/components/LayerSwitcher'), { ssr: false })
import PlotCardList from '@/components/PlotCardList'
import SettlementContextBar from '@/components/SettlementContextBar'
import QuickFilters from '@/components/ui/QuickFilters'
import { log } from '@/lib/logger'
import { getGeometryBounds, getPlotBounds, type PlotBounds } from '@/lib/plot-bounds'
import ResizeHandle from '@/components/ui/ResizeHandle'
import { usePersistentLayout } from '@/lib/use-persistent-layout'
import { DEFAULT_NSPD_LAYER_VISIBILITY, type NspdLayerVisibility } from '@/lib/plot-map-layers'

const URL_FILTER_KEYS = [
  'query',
  'settlement_id',
  'status',
  'permitted_use',
  'category',
  'price_min',
  'price_max',
  'area_min',
  'area_max',
  'sort_by',
  'sort_order',
] as const

export default function HomePage() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadIdRef = useRef(0)
  const selectionRequestIdRef = useRef(0)
  const [plotsList, setPlotsList] = useState<any[]>([])
  const [plotsTotal, setPlotsTotal] = useState(0)
  const [listBounds, setListBounds] = useState<PlotBounds | null>(null)
  const [selectedBounds, setSelectedBounds] = useState<PlotBounds | null>(null)
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null)
  const [selectedPlot, setSelectedPlot] = useState<Partial<Plot> & { id?: string } | null>(null)
  const [popupPlot, setPopupPlot] = useState<Record<string, any> | null>(null)
  const selectedPlotRequestIdRef = useRef(0)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [filtersReady, setFiltersReady] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE_LAYER_ID)
  const [showTatarstanCadastre, setShowTatarstanCadastre] = useState(false)
  const [nspdLayerVisibility, setNspdLayerVisibility] = useState<NspdLayerVisibility>(DEFAULT_NSPD_LAYER_VISIBILITY)
  const [nspdOpacity, setNspdOpacity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapInit, setMapInit] = useState(false)
  const [searchResetToken, setSearchResetToken] = useState(0)
  const [filterRailWidth, setFilterRailWidth] = usePersistentLayout('landsearch:filter-rail-width', 288, 240, 420)
  const [resultTrayHeight, setResultTrayHeight] = usePersistentLayout('landsearch:result-tray-height', 248, 176, 680)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const syncResponsiveFilters = () => setShowFilters(!mediaQuery.matches)
    syncResponsiveFilters()
    mediaQuery.addEventListener?.('change', syncResponsiveFilters)
    return () => mediaQuery.removeEventListener?.('change', syncResponsiveFilters)
  }, [])

  const loadData = useCallback(async (f: Record<string, string>) => {
    const id = ++loadIdRef.current
    setLoading(true)
    setError(null)
    setPlotsList([])
    setPlotsTotal(0)
    setListBounds(null)
    log('data', 'Запрос данных', JSON.stringify(f))
    const t0 = performance.now()
    try {
      const list = await api.plots.list({ ...f, page_size: '200', include_geometry: 'false' })
      if (id !== loadIdRef.current) return
      log('data', `Данные загружены за ${Math.round(performance.now() - t0)}ms`, `plots: ${list.total} total`)
      setPlotsList(list.items)
      setPlotsTotal(list.total)
      setListBounds(getPlotBounds(list.items))
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
    const params = new URLSearchParams(window.location.search)
    const initialFilters: Record<string, string> = {}
    for (const key of URL_FILTER_KEYS) {
      const value = params.get(key)
      if (value) initialFilters[key] = value
    }
    setFilters(initialFilters)
    setFiltersReady(true)
  }, [])

  useEffect(() => {
    if (!filtersReady || filters.settlement_id || !filters.query) return
    const query = filters.query.trim()
    let active = true
    api.search.suggest(query).then(({ results }) => {
      const settlement = results.find((item) =>
        item.type === 'settlement' && item.value.trim().toLocaleLowerCase('ru-RU') === query.toLocaleLowerCase('ru-RU'),
      )
      if (active && settlement) {
        setFilters((current) => current.settlement_id ? current : { ...current, settlement_id: settlement.id })
      }
    }).catch(() => {})
    return () => { active = false }
  }, [filters.query, filters.settlement_id, filtersReady])

  useEffect(() => {
    if (!filtersReady) return
    loadData(filters)
  }, [filters, filtersReady, loadData])

  useEffect(() => {
    const settlementId = filters.settlement_id
    if (!filtersReady || !settlementId) {
      setSelectedSettlement(null)
      return
    }

    let active = true
    api.settlements.get(settlementId, { include_plots: false }).then((settlement) => {
      if (!active) return
      setSelectedSettlement(settlement)
      setSelectedBounds(getGeometryBounds(settlement.geometry))
    }).catch(() => {
      if (active) setSelectedSettlement(null)
    })

    return () => { active = false }
  }, [filters.settlement_id, filtersReady])

  useEffect(() => {
    if (!filtersReady) return
    const params = new URLSearchParams()
    for (const key of URL_FILTER_KEYS) {
      const value = filters[key]?.trim()
      if (value) params.set(key, value)
    }
    const query = params.toString()
    window.history.replaceState(null, '', query ? `/?${query}` : '/')
  }, [filters, filtersReady])

  const handleFiltersChange = (nextFilters: Record<string, string>) => {
    selectionRequestIdRef.current += 1
    setSelectedBounds(null)
    setFilters(nextFilters)
  }

  const updateSearchFilters = (query: string, settlementId?: string) => {
    setFilters((previous) => {
      const next: Record<string, string> = { ...previous, query }
      if (settlementId) next.settlement_id = settlementId
      else delete next.settlement_id
      return next
    })
  }

  const handleSearch = async ({ query: rawQuery, suggestion }: SearchRequest) => {
    const query = rawQuery.trim()
    const selectionRequestId = ++selectionRequestIdRef.current
    selectedPlotRequestIdRef.current += 1
    setSelectedPlot(null)
    setPopupPlot(null)
    if (!query) {
      setSelectedBounds(null)
      setSelectedSettlement(null)
      setFilters({})
      return
    }

    setSelectedBounds(null)

    if (suggestion?.type === 'settlement') {
      setFilters((previous) => {
        const next: Record<string, string> = { ...previous, settlement_id: suggestion.id }
        delete next.query
        return next
      })
      try {
        const settlement = await api.settlements.get(suggestion.id, { include_plots: false })
        if (selectionRequestId === selectionRequestIdRef.current) {
          setSelectedSettlement(settlement)
          setSelectedBounds(getGeometryBounds(settlement.geometry))
        }
      } catch {
        // The list bounds still provide a safe viewport when settlement geometry is unavailable.
      }
      return
    }

    if (suggestion?.type === 'plot') {
      updateSearchFilters(query)
      try {
        const plot = await api.plots.get(suggestion.id)
        if (selectionRequestId === selectionRequestIdRef.current) {
          setSelectedBounds(getGeometryBounds(plot.geometry))
        }
      } catch {
        // The list bounds still provide a safe viewport when plot geometry is unavailable.
      }
      return
    }

    updateSearchFilters(query)
  }

  const flyToPlot = (plot: any) => {
    const map = mapRef.current
    if (!map || !plot.center_lng || !plot.center_lat) return
    const compactViewport = map.getContainer().clientWidth < 768
    map.flyTo({
      center: [plot.center_lng, plot.center_lat],
      zoom: 15,
      padding: compactViewport
        ? { top: 72, right: 32, bottom: 280, left: 32 }
        : { top: 72, right: 400, bottom: Math.min(resultTrayHeight + 32, 560), left: 32 },
    })
  }

  const handlePlotClick = async (props: Record<string, any>) => {
    const requestId = ++selectedPlotRequestIdRef.current
    setSelectedPlot(props)
    setPopupPlot(props)
    if (!props.id) return

    try {
      const plot = await api.plots.get(String(props.id))
      if (requestId !== selectedPlotRequestIdRef.current) return
      setSelectedPlot(plot)
      setPopupPlot(plot)
      flyToPlot(plot)
    } catch {
      // Keep the existing popup when the detail request is unavailable.
    }
  }

  const handleCardSelect = (plot: Plot) => {
    const requestId = ++selectedPlotRequestIdRef.current
    setSelectedPlot(plot)
    setPopupPlot(plot)
    if (plot.geometry || !plot.id) return

    api.plots.get(plot.id).then((detail) => {
      if (requestId !== selectedPlotRequestIdRef.current) return
      setSelectedPlot(detail)
      setPopupPlot(detail)
    }).catch(() => {
      // Keep the selected card and its centroid pin when detail loading fails.
    })
  }

  const handleCardHover = (plot: Plot) => {
    setSelectedPlot(plot)
  }

  const clearSettlementScope = () => {
    selectionRequestIdRef.current += 1
    setSelectedBounds(null)
    setSelectedSettlement(null)
    setSearchResetToken((current) => current + 1)
    setFilters((previous) => {
      const next = { ...previous }
      delete next.settlement_id
      delete next.query
      return next
    })
  }

  const resultBounds = selectedBounds ?? listBounds

  return (
    <div className="flex flex-col h-screen">
      <header className="z-20 flex items-center gap-3 border-b border-[var(--ls-line)] bg-[var(--ls-surface)] px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ls-green)]">
            <MapPinned className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-[var(--ls-ink)]">LandSearch</h1>
        </div>
        <div className="hidden md:block md:flex-1 md:max-w-xl">
          <SearchBar onSearch={handleSearch} resetToken={searchResetToken} />
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <div className="hidden items-center gap-1 text-[var(--ls-muted)] md:flex">
            <span className="text-[var(--ls-green)] font-semibold">{plotsTotal}</span>
            <span>найдено</span>
          </div>
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            aria-label={showFilters ? 'Скрыть фильтры' : 'Открыть фильтры'}
            aria-expanded={showFilters}
            className={`ls-control min-h-11 min-w-11 p-2 ${showFilters ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]' : 'text-[var(--ls-muted)]'}`}
            title="Фильтры">
            <Filter className="mx-auto h-5 w-5" aria-hidden="true" />
          </button>
          <div className="hidden md:flex items-center gap-1 sm:gap-2">
            <a href="/auth/login" className="inline-flex min-h-11 items-center rounded-md bg-[var(--ls-green)] px-3 text-xs font-semibold text-white hover:bg-[var(--ls-green-dark)] sm:px-4 sm:text-sm">Войти</a>
            <a href="/admin" className="ls-control inline-flex min-h-11 items-center px-3 text-xs font-semibold sm:px-4 sm:text-sm">Админка</a>
          </div>
        </div>
      </header>

      <div className="border-b border-[var(--ls-line)] bg-[var(--ls-surface)] px-4 py-2 md:hidden">
        <SearchBar onSearch={handleSearch} resetToken={searchResetToken} />
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {showFilters && (
          <div className="hidden md:flex shrink-0 items-stretch" style={{ width: `${filterRailWidth + 12}px` }}>
            <FilterPanel width={filterRailWidth} filters={filters} onChange={handleFiltersChange} />
            <ResizeHandle
              axis="x"
              value={filterRailWidth}
              min={240}
              max={420}
              label="Ширина панели фильтров"
              onChange={setFilterRailWidth}
            />
          </div>
        )}

        {showFilters && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowFilters(false)} />
            <div className="relative w-[min(22rem,88vw)] max-w-[88vw] bg-white shadow-xl">
              <FilterPanel mobile onClose={() => setShowFilters(false)} filters={filters} onChange={handleFiltersChange} />
            </div>
          </div>
        )}

        <main
          className="flex-1 min-h-0 relative"
          style={{ '--result-tray-height': `${resultTrayHeight}px` } as React.CSSProperties}
        >
          <div className="absolute inset-0 z-0">
            <MapView
              mapRef={mapRef}
              filters={filters}
              resultBounds={resultBounds}
              boundaryGeometry={selectedSettlement?.geometry}
              selectedPlot={selectedPlot}
              showTatarstanCadastre={showTatarstanCadastre}
              nspdLayerVisibility={nspdLayerVisibility}
              nspdOpacity={nspdOpacity}
              resultTrayHeight={resultTrayHeight}
              onMapReady={() => setMapInit(true)}
              onPlotClick={handlePlotClick}
            />
          </div>

          {!mapInit && (
            <div className="absolute inset-0 z-30 bg-gray-100 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-gray-300 border-t-[var(--ls-green)] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Загрузка карты...</p>
              </div>
            </div>
          )}

          {loading && mapInit && (
            <div className="ls-panel absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 px-4 py-2 text-sm text-[var(--ls-muted)]" role="status" aria-live="polite">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[var(--ls-green)] rounded-full animate-spin" />
              Загрузка данных...
            </div>
          )}
          {error && (
            <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg" role="alert">{error}</div>
          )}

          {popupPlot && <PlotPopup plot={popupPlot} onClose={() => setPopupPlot(null)} />}

          {selectedSettlement && (
            <SettlementContextBar
              settlement={selectedSettlement}
              total={plotsTotal}
              onClear={clearSettlementScope}
            />
          )}

          <div className={`absolute top-4 right-12 sm:right-16 z-30 ${popupPlot ? 'ls-layer-switcher-selected' : ''}`}>
            <LayerSwitcher
              map={mapRef.current}
              currentLayer={baseLayer}
              onChange={setBaseLayer}
              filters={filters}
              showTatarstanCadastre={showTatarstanCadastre}
              onTatarstanCadastreChange={setShowTatarstanCadastre}
              nspdLayerVisibility={nspdLayerVisibility}
              onNspdLayerVisibilityChange={setNspdLayerVisibility}
              nspdOpacity={nspdOpacity}
              onNspdOpacityChange={setNspdOpacity}
            />
          </div>

          <QuickFilters filters={filters} onChange={handleFiltersChange} />

          <PlotCardList
            plots={plotsList}
            total={plotsTotal}
            selectedPlotId={popupPlot?.id || selectedPlot?.id}
            height={resultTrayHeight}
            onHeightChange={setResultTrayHeight}
            onSelect={handleCardSelect}
            onHover={handleCardHover}
            onFlyTo={flyToPlot}
          />
        </main>
      </div>

      <LogPanel />
    </div>
  )
}
