'use client'

import { useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import MapView from '@/components/MapView'
import LayerSwitcher from '@/components/LayerSwitcher'
import { DEFAULT_BASE_LAYER_ID } from '@/lib/constants'
import { usePersistentBoolean } from '@/lib/use-persistent-boolean'

export default function MapPage() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE_LAYER_ID)
  const [showRoads, setShowRoads] = usePersistentBoolean('landsearch:roads-visible', true)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [mapReady, setMapReady] = useState(false)
  const [showTatarstanCadastre, setShowTatarstanCadastre] = useState(false)

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-white border-b px-4 py-2 flex items-center gap-4 z-10">
        <a href="/" className="text-blue-600">&larr; На главную</a>
        <h1 className="font-bold">LandSearch — Карта</h1>
        <select
          value={filters.status || ''}
          onChange={(e) => setFilters((f) => {
            const next = { ...f }
            if (e.target.value) next.status = e.target.value
            else delete next.status
            return next
          })}
          className="ml-auto border rounded px-2 py-1 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="free">Свободен</option>
          <option value="reserved">В резерве</option>
          <option value="booked">Забронирован</option>
          <option value="sold">Продан</option>
        </select>
        <LayerSwitcher
          map={mapReady ? mapRef.current : null}
          currentLayer={baseLayer}
          onChange={setBaseLayer}
          filters={filters}
          showRoads={showRoads}
          onRoadsChange={setShowRoads}
          showTatarstanCadastre={showTatarstanCadastre}
          onTatarstanCadastreChange={setShowTatarstanCadastre}
        />
      </div>
      <div className="flex-1 relative">
        <MapView
          mapRef={mapRef}
          filters={filters}
          showRoads={showRoads}
          showTatarstanCadastre={showTatarstanCadastre}
          onMapReady={() => setMapReady(true)}
        />
      </div>
    </div>
  )
}
