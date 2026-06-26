'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, Plot } from '@/lib/api'

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

export default function PlotDetailPage() {
  const params = useParams()
  const [plot, setPlot] = useState<Plot | null>(null)
  const [loading, setLoading] = useState(true)
  const [baseLayer, setBaseLayer] = useState('satellite')

  useEffect(() => {
    if (!params.id) return
    api.plots.get(params.id as string).then(setPlot).finally(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!plot?.geometry || typeof window === 'undefined') return

    const layer = BASE_LAYERS.find((l) => l.id === baseLayer) || BASE_LAYERS[0]

    const map = new maplibregl.Map({
      container: 'detail-map',
      style: layer.style,
      center: [38.12, 55.57],
      zoom: 14,
    })

    map.on('load', () => {
      map.addSource('plot', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: plot.geometry,
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
      if (plot.geometry.type === 'Polygon') {
        plot.geometry.coordinates[0].forEach((coord: number[]) => {
          bounds.extend(coord as [number, number])
        })
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50 })
      }
    })

    return () => map.remove()
  }, [plot, baseLayer])

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
                  onClick={() => setBaseLayer(layer.id)}
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
