'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, type SettlementAnalysis } from '@/lib/api'
import { STATUS_COLORS, BASE_LAYERS, DEFAULT_BASE_LAYER_ID } from '@/lib/constants'
import { buildPlotTileUrl } from '@/lib/map-tiles'
import { addPlotTileLayers } from '@/lib/plot-map-layers'
import { Home, ArrowLeft, Map as MapIcon } from 'lucide-react'
import Link from 'next/link'

const LANDSCANNER_MAP_SETTLEMENT_ID = 'eafe5fc4-165f-421e-aa79-3ae786458627'

export default function SettlementAnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [analysis, setAnalysis] = useState<SettlementAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE_LAYER_ID)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const reinitGuard = useRef(false)
  const appliedBaseLayerRef = useRef(baseLayer)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.settlements.analyze(id)
      .then((data) => {
        setAnalysis(data)
        setAnalysisError(null)
      })
      .catch((e) => {
        setAnalysisError(e.message)
        setAnalysis(null)
      })
      .finally(() => setLoading(false))
  }, [id])

  const reinit = useCallback(async (map: maplibregl.Map) => {
    if (!id || reinitGuard.current) return
    reinitGuard.current = true

    try {
      const settlement = await api.settlements.get(id, { include_plots: false })

      const safeAdd = () => {
        addLayers(map, settlement.geometry, id)
      }

      if (!map.isStyleLoaded()) {
        map.once('style.load', safeAdd)
      } else {
        safeAdd()
      }
    } catch {
      reinitGuard.current = false
    }
  }, [id])

  useEffect(() => {
    if (!id || typeof window === 'undefined') return
    if (mapRef.current) return

    const firstLayer = BASE_LAYERS[0]!
    const map = new maplibregl.Map({
      container: 'settlement-map',
      style: BASE_LAYERS.find((l) => l.id === baseLayer)?.style || firstLayer.style,
      center: [38.12, 55.57],
      zoom: 12,
    })
    mapRef.current = map
    appliedBaseLayerRef.current = baseLayer

    const loadLayers = () => {
      void reinit(map)
    }

    map.once('style.load', loadLayers)
    setTimeout(loadLayers, 500)

    return () => { map.remove(); mapRef.current = null; reinitGuard.current = false }
  }, [baseLayer, id, reinit])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (appliedBaseLayerRef.current === baseLayer) return
    const style = BASE_LAYERS.find((l) => l.id === baseLayer)?.style
    if (style && map.isStyleLoaded()) {
      map.setStyle(style)
      appliedBaseLayerRef.current = baseLayer
      reinitGuard.current = false
      const loadLayers = () => {
        void reinit(map)
      }
      map.once('style.load', loadLayers)
      setTimeout(loadLayers, 500)
    }
  }, [baseLayer, reinit])

  const switchLayer = (layerId: string) => {
    setBaseLayer(layerId)
  }

  const vriEntries = analysis
    ? Object.entries(analysis.vri_summary).sort((a, b) => b[1] - a[1])
    : []
  const statusColors: Record<string, string> = {
    free: 'bg-green-100 text-green-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    booked: 'bg-orange-100 text-orange-700',
    sold: 'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-gray-50" aria-busy={loading}>
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Home className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Поселение</h1>
        {id === LANDSCANNER_MAP_SETTLEMENT_ID && (
          <Link
            href={`/settlements/${id}/map`}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <MapIcon className="h-4 w-4" />
            Карта посёлка
          </Link>
        )}
      </header>

      {/* Map */}
      <div className="relative w-full" style={{ height: '400px' }}>
        <div id="settlement-map" className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-100/70 backdrop-blur-[1px]" role="status" aria-live="polite">
            <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-white rounded-lg shadow-lg border p-1 flex gap-1">
            {BASE_LAYERS.map((layer) => (
              <button
                key={layer.id}
                onClick={() => switchLayer(layer.id)}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                  baseLayer === layer.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'hover:bg-gray-50 text-gray-600'
                }`}
                title={layer.name}
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{layer.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 rounded-lg shadow p-3 text-xs space-y-1">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-gray-700">
                {status === 'free' ? 'Свободен' : status === 'reserved' ? 'В резерве' : status === 'booked' ? 'Забронирован' : 'Продан'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {analysisError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm">
            {analysisError}
          </div>
        )}

        {analysis && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Площадь" value={`${analysis.total_area_ha.toFixed(1)} га`} />
              <StatCard label="Участков" value={`${analysis.total_plots} шт.`} />
              <StatCard label="Свободно" value={`${analysis.free_plots_count} шт.`} sub={`${analysis.free_percent.toFixed(1)}%`} />
              <StatCard label="Занято" value={`${analysis.occupied_plots_count} шт.`} sub={`${analysis.occupied_percent.toFixed(1)}%`} />
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-900 mb-3">Площадь</h2>
              <div className="space-y-2">
                <Row label="Общая площадь" value={`${analysis.total_area_ha.toFixed(2)} га`} />
                <Row label="Свободная" value={`${analysis.free_area_ha.toFixed(2)} га`} sub={`${analysis.free_percent.toFixed(1)}%`} />
                <Row label="Занятая" value={`${analysis.occupied_area_ha.toFixed(2)} га`} sub={`${analysis.occupied_percent.toFixed(1)}%`} />
                <Row label="Свободных зон" value={`${analysis.free_zones_count} шт.`} />
              </div>
              {analysis.total_price > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Row label="Общая стоимость" value={`${new Intl.NumberFormat('ru-RU').format(analysis.total_price)} ₽`} />
                  <Row label="Ср. цена за га" value={`${new Intl.NumberFormat('ru-RU').format(analysis.total_price_per_ha)} ₽`} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-900 mb-3">ВРИ (виды разрешённого использования)</h2>
              {vriEntries.length > 0 ? (
                <div className="space-y-1.5">
                  {vriEntries.map(([code, count]) => (
                    <div key={code} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: VRI_COLORS[code] || VRI_DEFAULT_COLOR }} />
                      <span className="text-gray-600 min-w-[80px]">{code}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(count / analysis.total_plots) * 100}%`,
                            backgroundColor: VRI_COLORS[code] || VRI_DEFAULT_COLOR,
                          }}
                        />
                      </div>
                      <span className="text-gray-900 font-medium min-w-[40px] text-right">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Нет данных</p>
              )}
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm text-gray-900 mb-3">Статусы</h2>
              <div className="space-y-1.5">
                {Object.entries(analysis.status_summary).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
                      {status === 'free' ? 'Свободен' : status === 'reserved' ? 'В резерве' : status === 'booked' ? 'Забронирован' : 'Продан'}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {analysis.free_zones.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <h2 className="font-semibold text-sm text-gray-900 mb-3">Свободные зоны ({analysis.free_zones.length})</h2>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {analysis.free_zones.map((z) => (
                    <div key={z.zone_index} className="flex items-center justify-between text-sm py-1">
                      <span className="text-gray-500">Зона #{z.zone_index}</span>
                      <span className="font-medium">{z.area_ha.toFixed(2)} га</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!analysis && !analysisError && !loading && (
          <div className="text-center py-12 text-gray-400">Нет данных для отображения</div>
        )}
      </main>
    </div>
  )
}

function addLayers(map: maplibregl.Map, geometry: Record<string, unknown> | undefined, settlementId: string) {
  if (geometry) {
    const sourceId = 'settlement-boundary'
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId as any, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geometry as any,
            properties: {},
          }],
        },
      } as any)

      map.addLayer({
        id: 'settlement-boundary-fill',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.08,
        },
      } as any)

      map.addLayer({
        id: 'settlement-boundary-line',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [4, 3],
        },
      } as any)
    }
  }

  addPlotTileLayers(map, buildPlotTileUrl({ settlement_id: settlementId }))

  const bounds = new maplibregl.LngLatBounds()
  if (geometry) {
    extractCoords(geometry).forEach((c) => bounds.extend(c as [number, number]))
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 50 })
  }
}

function extractCoords(geometry: Record<string, unknown>): number[][] {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][])[0] || []
  }
  if (geometry.type === 'MultiPolygon') {
    const result: number[][] = []
    ;(geometry.coordinates as number[][][][]).forEach((poly) => {
      poly[0]?.forEach((c) => result.push(c))
    })
    return result
  }
  return []
}

const VRI_COLORS: Record<string, string> = {
  ИЖС: '#009E73',
  ЛПХ: '#8C510A',
  СНТ: '#E69F00',
  ОГОРОД: '#AEEA00',
  ДНП: '#CC79A7',
  ОГП: '#D55E00',
  ГАРАЖ: '#8D6E63',
  КОМ: '#C51B7D',
  СКЛАД: '#9E9D24',
  ПРОМ: '#6B7280',
  КОММУН: '#26C6DA',
  СХ: '#F0E442',
  СПОРТ: '#26A69A',
  РИТУАЛ: '#5D4037',
  ОТДЫХ: '#56B4E9',
  ЖИЛОЙ: '#0072B2',
  СОЦИАЛЬНЫЙ: '#7CB342',
  ТРАНСПОРТ: '#4B5563',
  СВЯЗЬ: '#A78BFA',
  ОБОРОНА: '#111827',
  ЛЕСНОЙ: '#006D2C',
  ВОДНЫЙ: '#1D4ED8',
  СПЕЦИАЛЬНЫЙ: '#374151',
  ЗАПАС: '#78909C',
  ПУСТЫРЬ: '#BDBDBD',
  ДРУГОЕ: '#0891B2',
}

const VRI_DEFAULT_COLOR = '#0891B2'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">
        {value}{sub && <span className="text-gray-400 ml-1">({sub})</span>}
      </span>
    </div>
  )
}
