'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Check, Copy, Map as MapIcon } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import LeadForm from '@/components/ui/LeadForm'
import { api, Plot } from '@/lib/api'
import { BASE_LAYERS, DEFAULT_BASE_LAYER_ID, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { copyText } from '@/lib/clipboard'
import { getGeometryBounds } from '@/lib/plot-bounds'

const DETAIL_PLOT_SOURCE_ID = 'detail-plot'

function money(value: number | undefined | null): string {
  if (!value) return 'Цена по запросу'
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
}

function detailPlotFeature(plot: Plot) {
  return {
    type: 'Feature' as const,
    geometry: plot.geometry as any,
    properties: {
      id: plot.id,
      status: plot.status,
    },
  }
}

function addDetailPlotLayer(map: maplibregl.Map, plot: Plot, fit = false): void {
  const data = {
    type: 'FeatureCollection' as const,
    features: [detailPlotFeature(plot)],
  }
  const source = map.getSource(DETAIL_PLOT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined

  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: [detailPlotFeature(plot)],
    } as any)
  } else {
    map.addSource(DETAIL_PLOT_SOURCE_ID, {
      type: 'geojson',
      data,
    })
  }

  if (!map.getLayer('detail-plot-fill')) {
    map.addLayer({
      id: 'detail-plot-fill',
      type: 'fill',
      source: DETAIL_PLOT_SOURCE_ID,
      paint: {
        'fill-color': STATUS_COLORS[plot.status] || '#22c55e',
        'fill-opacity': 0.42,
      },
    })
  }

  if (!map.getLayer('detail-plot-border')) {
    map.addLayer({
      id: 'detail-plot-border',
      type: 'line',
      source: DETAIL_PLOT_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': STATUS_COLORS[plot.status] || '#16a34a',
        'line-width': 3,
        'line-opacity': 0.95,
      },
    })
  }

  if (fit) {
    const bounds = getGeometryBounds(plot.geometry)
    if (bounds) {
      map.fitBounds(bounds, { padding: 72, maxZoom: 18 })
    }
  }
}

export default function PlotDetailPage() {
  const params = useParams()
  const [plot, setPlot] = useState<Plot | null>(null)
  const [loading, setLoading] = useState(true)
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE_LAYER_ID)
  const [copied, setCopied] = useState(false)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const detailMapContainerRef = useRef<HTMLDivElement | null>(null)
  const switchingLayerRef = useRef(false)
  const queuedLayerRef = useRef<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    api.plots.get(params.id as string).then(setPlot).finally(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!plot?.geometry || typeof window === 'undefined') return
    if (!detailMapContainerRef.current || mapRef.current) return

    const fallbackLayer = BASE_LAYERS[0]!
    const map = new maplibregl.Map({
      container: detailMapContainerRef.current,
      style: BASE_LAYERS.find((l) => l.id === baseLayer)?.style || fallbackLayer.style,
      center: [plot.center_lng || 38.12, plot.center_lat || 55.57],
      zoom: 14,
    })
    mapRef.current = map

    map.on('load', () => addDetailPlotLayer(map, plot, true))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [plot])

  const switchBaseLayer = (layerId: string) => {
    const layer = BASE_LAYERS.find((item) => item.id === layerId)
    const map = mapRef.current
    if (!layer || !map || !plot) return
    if (switchingLayerRef.current) {
      queuedLayerRef.current = layerId
      return
    }

    switchingLayerRef.current = true
    setBaseLayer(layerId)
    let done = false
    let styleReady = false
    const finish = () => {
      if (done) return
      done = true
      switchingLayerRef.current = false
      const queuedLayer = queuedLayerRef.current
      queuedLayerRef.current = null
      if (queuedLayer && queuedLayer !== layerId) switchBaseLayer(queuedLayer)
    }
    const reinit = () => {
      if (styleReady) return
      styleReady = true
      addDetailPlotLayer(map, plot)
      map.once('idle', () => window.setTimeout(finish, 4000))
      window.setTimeout(finish, 6000)
    }
    map.once('style.load', reinit)
    map.setStyle(layer.style)
    setTimeout(reinit, 500)
  }

  const copyCadastralNumber = async () => {
    if (!plot) return
    const copiedSuccessfully = await copyText(plot.cadastral_number)
    setCopied(copiedSuccessfully)
    if (copiedSuccessfully) {
      window.setTimeout(() => setCopied(false), 1200)
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center">Загрузка...</div>
  if (!plot) return <div className="flex h-screen items-center justify-center">Участок не найден</div>

  const areaSotka = plot.area_m2 ? plot.area_m2 / 100 : null
  const pricePerSotka = plot.price && areaSotka ? plot.price / areaSotka : null

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      <aside className="w-full border-b bg-white p-5 lg:h-screen lg:w-[420px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <Link href="/" className="mb-4 block text-sm text-blue-600 hover:text-blue-700">
          &larr; На карту
        </Link>

        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">
            {plot.title || `Участок ${plot.cadastral_number}`}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <p className="font-mono text-sm text-gray-500">{plot.cadastral_number}</p>
            <button
              type="button"
              onClick={copyCadastralNumber}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
              title="Скопировать кадастровый номер"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Статус</span>
            <span className="font-semibold" style={{ color: STATUS_COLORS[plot.status] || '#22c55e' }}>
              {STATUS_LABELS[plot.status] || plot.status}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Цена</span>
            <span className="text-right text-base font-bold text-gray-900">{money(plot.price)}</span>
          </div>
          {pricePerSotka && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Цена за сотку</span>
              <span>{money(pricePerSotka)}</span>
            </div>
          )}
          {areaSotka && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Площадь</span>
              <span>{areaSotka.toFixed(1)} сот. ({plot.area_m2?.toFixed(0)} м²)</span>
            </div>
          )}
          {plot.price_per_hectare && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Цена за га</span>
              <span>{money(plot.price_per_hectare)}</span>
            </div>
          )}
          {plot.permitted_use && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">ВРИ</span>
              <span className="max-w-56 text-right">{plot.permitted_use}</span>
            </div>
          )}
          {plot.category && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Категория</span>
              <span className="max-w-56 text-right">{plot.category}</span>
            </div>
          )}
          {plot.cadastral_value && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Кадастровая стоимость</span>
              <span>{money(plot.cadastral_value)}</span>
            </div>
          )}
          {plot.address && (
            <div className="border-t border-gray-100 pt-3">
              <span className="mb-1 block text-gray-600">Адрес</span>
              <p>{plot.address}</p>
            </div>
          )}
          {plot.description && (
            <div className="border-t border-gray-100 pt-3">
              <span className="mb-1 block text-gray-600">Описание</span>
              <p>{plot.description}</p>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <LeadForm plotId={plot.id} title="Получить консультацию" />
        </div>
      </aside>

      <main className="relative min-h-[420px] flex-1 lg:h-screen">
        <div className="absolute inset-0">
          <div ref={detailMapContainerRef} className="h-full w-full" />
        </div>
        <div className="absolute right-4 top-4 z-10">
          <div className="rounded-md border bg-white p-1 shadow-lg">
            <div className="flex flex-wrap gap-1">
              {BASE_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => switchBaseLayer(layer.id)}
                  className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm ${
                    baseLayer === layer.id
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  title={layer.name}
                >
                  <MapIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{layer.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
