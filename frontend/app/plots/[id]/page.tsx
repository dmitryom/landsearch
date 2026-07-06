'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, Plot } from '@/lib/api'
import { STATUS_COLORS, STATUS_LABELS, BASE_LAYERS } from '@/lib/constants'

export default function PlotDetailPage() {
  const params = useParams()
  const [plot, setPlot] = useState<Plot | null>(null)
  const [loading, setLoading] = useState(true)
  const firstLayer = BASE_LAYERS[0]!
  const [baseLayer, setBaseLayer] = useState('satellite')
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!params.id) return
    api.plots.get(params.id as string).then(setPlot).finally(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!plot?.geometry || typeof window === 'undefined') return
    if (mapRef.current) return

    const firstLayer = BASE_LAYERS[0]!
    const map = new maplibregl.Map({
      container: 'detail-map',
      style: BASE_LAYERS.find((l) => l.id === baseLayer)?.style || firstLayer.style,
      center: [38.12, 55.57],
      zoom: 14,
    })
    mapRef.current = map

    map.on('load', () => {
      const geom = plot.geometry as Record<string, any> | undefined
      map.addSource('plot', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geom as any,
            properties: {},
          }],
        },
      })

      map.addLayer({
        id: 'plot-fill',
        type: 'fill',
        source: 'plot',
        paint: {
          'fill-color': STATUS_COLORS[plot.status] || '#22c55e',
          'fill-opacity': 0.4,
        },
      })

      map.addLayer({
        id: 'plot-border',
        type: 'line',
        source: 'plot',
        paint: {
          'line-color': STATUS_COLORS[plot.status] || '#16a34a',
          'line-width': 3,
        },
      })

      const bounds = new maplibregl.LngLatBounds()
      if (geom?.type === 'Polygon') {
        const coords = geom.coordinates as number[][][]
        coords[0]?.forEach((coord: number[]) => {
          bounds.extend(coord as [number, number])
        })
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50 })
      }
    })

    return () => { map.remove(); mapRef.current = null }
  }, [plot])

  if (loading) return <div className="flex items-center justify-center h-screen">Загрузка...</div>
  if (!plot) return <div className="flex items-center justify-center h-screen">Участок не найден</div>

  return (
    <div className="flex h-screen">
      <div className="w-96 bg-white p-6 overflow-y-auto border-r">
        <a href="/" className="text-blue-600 text-sm mb-4 block">&larr; На карту</a>
        <h1 className="text-xl font-bold mb-2">{plot.title || plot.cadastral_number}</h1>
        <p className="font-mono text-sm text-gray-500 mb-4">{plot.cadastral_number}</p>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Статус</span>
            <span className="font-semibold" style={{ color: STATUS_COLORS[plot.status] || '#22c55e' }}>
              {STATUS_LABELS[plot.status] || plot.status}
            </span>
          </div>
          {plot.price && (
            <div className="flex justify-between">
              <span className="text-gray-600">Цена</span>
              <span className="font-bold text-lg">
                {new Intl.NumberFormat('ru-RU').format(plot.price)} ₽
              </span>
            </div>
          )}
          {plot.area_m2 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Площадь</span>
              <span>{(plot.area_m2 / 100).toFixed(1)} сот. ({plot.area_m2.toFixed(0)} м²)</span>
            </div>
          )}
          {plot.price_per_hectare && (
            <div className="flex justify-between">
              <span className="text-gray-600">Цена за га</span>
              <span>{new Intl.NumberFormat('ru-RU').format(plot.price_per_hectare)} ₽</span>
            </div>
          )}
          {plot.permitted_use && (
            <div className="flex justify-between">
              <span className="text-gray-600">ВРИ</span>
              <span>{plot.permitted_use}</span>
            </div>
          )}
          {plot.category && (
            <div className="flex justify-between">
              <span className="text-gray-600">Категория</span>
              <span>{plot.category}</span>
            </div>
          )}
          {plot.cadastral_value && (
            <div className="flex justify-between">
              <span className="text-gray-600">Кадастровая стоимость</span>
              <span>{new Intl.NumberFormat('ru-RU').format(plot.cadastral_value)} ₽</span>
            </div>
          )}
          {plot.address && (
            <div>
              <span className="text-gray-600 block">Адрес</span>
              <p>{plot.address}</p>
            </div>
          )}
          {plot.description && (
            <div>
              <span className="text-gray-600 block">Описание</span>
              <p className="text-sm">{plot.description}</p>
            </div>
          )}
        </div>

        <button
          className="w-full mt-6 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          onClick={() => {
            const phone = prompt('Введите ваш телефон для консультации:')
            if (phone) {
              const el = document.createElement('a')
              el.href = `tel:${phone.replace(/[^0-9+]/g, '')}`
              el.click()
            }
          }}
        >
          Получить консультацию
        </button>
      </div>
      <div className="flex-1 relative">
        <div id="detail-map" className="absolute inset-0" />
        <div className="absolute top-4 right-4 z-10">
          <div className="relative">
            <div className="bg-white rounded-lg shadow-lg border p-1 flex gap-1">
              {BASE_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => {
                    setBaseLayer(layer.id)
                    const map = mapRef.current
                    if (map && map.isStyleLoaded()) {
                      map.setStyle(layer.style)
                    }
                  }}
                  className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                    baseLayer === layer.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}
                  title={layer.name}
                >
                  <span>{layer.icon}</span>
                  <span className="hidden sm:inline">{layer.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
