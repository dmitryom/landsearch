'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Database, Layers, Map, MapPinned, Satellite, Route, ShieldAlert } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import { BASE_LAYERS } from '@/lib/constants'
import { log } from '@/lib/logger'
import { buildPlotTileUrl, TATARSTAN_BOUNDS } from '@/lib/map-tiles'
import {
  addPlotTileLayers,
  DEFAULT_NSPD_LAYER_VISIBILITY,
  setTatarstanCadastreLayer,
  updatePlotTileUrl,
  type NspdLayerKey,
  type NspdLayerVisibility,
} from '@/lib/plot-map-layers'
import { addRoadLayers, setRoadLayerVisibility } from '@/lib/road-map-layers'

const BASE_ICONS = {
  landscanner: Satellite,
  satellite: Satellite,
  hybrid: MapPinned,
  osm: Map,
  topo: Map,
  light: Map,
  dark: Map,
  voyager: Map,
  cyclosm: Route,
} as const

const DATA_LAYERS: Array<{ key: NspdLayerKey; label: string; source: string; Icon: typeof Building2 }> = [
  { key: 'plots', label: 'Участки NSPD', source: 'NSPD 36048', Icon: MapPinned },
  { key: 'buildings', label: 'Здания', source: 'NSPD 36049', Icon: Building2 },
  { key: 'structures', label: 'Сооружения', source: 'NSPD 36328', Icon: Database },
  { key: 'unfinished', label: 'Незавершённое строительство', source: 'NSPD 36329', Icon: ShieldAlert },
]

export default function LayerSwitcher({
  map,
  currentLayer,
  onChange,
  filters = {},
  showRoads = true,
  onRoadsChange,
  showTatarstanCadastre = false,
  onTatarstanCadastreChange,
  nspdLayerVisibility = DEFAULT_NSPD_LAYER_VISIBILITY,
  onNspdLayerVisibilityChange,
  nspdOpacity = 1,
  onNspdOpacityChange,
}: {
  map: maplibregl.Map | null
  currentLayer: string
  onChange: (id: string) => void
  filters?: Record<string, string>
  showRoads?: boolean
  onRoadsChange?: (enabled: boolean) => void
  showTatarstanCadastre?: boolean
  onTatarstanCadastreChange: (enabled: boolean) => void
  nspdLayerVisibility?: NspdLayerVisibility
  onNspdLayerVisibilityChange?: (visibility: NspdLayerVisibility) => void
  nspdOpacity?: number
  onNspdOpacityChange?: (opacity: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<'basemap' | 'data'>('data')
  const tileUrlRef = useRef(buildPlotTileUrl(filters))
  const switchingLayerRef = useRef(false)
  const queuedLayerRef = useRef<string | null>(null)

  useEffect(() => {
    tileUrlRef.current = buildPlotTileUrl(filters)
    if (!map) return
    updatePlotTileUrl(map, tileUrlRef.current)
  }, [filters, map])

  const switchLayer = (id: string) => {
    if (!map) return
    const layer = BASE_LAYERS.find((candidate) => candidate.id === id)
    if (!layer) return
    if (switchingLayerRef.current) {
      queuedLayerRef.current = id
      return
    }

    switchingLayerRef.current = true
    log('map', 'Switching layer', id)
    onChange(id)

    let done = false
    let styleReady = false
    const finish = () => {
      if (done) return
      done = true
      switchingLayerRef.current = false
      const queuedLayer = queuedLayerRef.current
      queuedLayerRef.current = null
      if (queuedLayer && queuedLayer !== id) switchLayer(queuedLayer)
    }
    const reinit = () => {
      if (styleReady) return
      styleReady = true
      addPlotTileLayers(map, tileUrlRef.current)
      addRoadLayers(map, showRoads, 'plots-border')
      setTatarstanCadastreLayer(map, showTatarstanCadastre, nspdLayerVisibility, nspdOpacity)
      log('map', 'Layer switched', id)
      map.once('idle', () => window.setTimeout(finish, 4000))
      window.setTimeout(finish, 6000)
    }
    map.once('style.load', reinit)
    map.setStyle(layer.style)
    window.setTimeout(reinit, 500)
  }

  const toggleDataLayer = (key: NspdLayerKey) => {
    const next = { ...nspdLayerVisibility, [key]: !nspdLayerVisibility[key] }
    onNspdLayerVisibilityChange?.(next)
    if (map?.isStyleLoaded()) setTatarstanCadastreLayer(map, showTatarstanCadastre, next, nspdOpacity)
  }

  const toggleRoads = (enabled: boolean) => {
    onRoadsChange?.(enabled)
    if (map?.isStyleLoaded()) setRoadLayerVisibility(map, enabled)
  }

  const toggleMaster = (enabled: boolean) => {
    onTatarstanCadastreChange(enabled)
    if (enabled && map?.isStyleLoaded()) {
      setTatarstanCadastreLayer(map, true, nspdLayerVisibility, nspdOpacity)
      map.fitBounds(TATARSTAN_BOUNDS, { padding: 48, maxZoom: 9, duration: 700 })
    }
  }

  const CurrentIcon = BASE_ICONS[currentLayer as keyof typeof BASE_ICONS] || Layers

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Подложка карты"
        aria-expanded={open}
        className="ls-control flex min-h-11 items-center gap-2 px-2.5 text-xs font-semibold sm:px-3 sm:text-sm"
        title="Карта и слои"
      >
        <CurrentIcon className="h-4 w-4 text-[var(--ls-green)]" aria-hidden="true" />
        <span className="hidden sm:inline">{BASE_LAYERS.find((layer) => layer.id === currentLayer)?.name || 'Карта'}</span>
      </button>

      {open && (
        <div className="ls-panel absolute -right-9 top-full z-40 mt-1 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden sm:right-0">
          <div className="grid grid-cols-2 gap-1 border-b border-[var(--ls-line)] p-1">
            <button type="button" onClick={() => setSection('basemap')} className={`min-h-11 rounded-md px-3 text-xs font-semibold ${section === 'basemap' ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]' : 'text-[var(--ls-muted)] hover:bg-[#fbfdfb]'}`}>
              <span className="flex items-center justify-center gap-1.5"><Map className="h-4 w-4" aria-hidden="true" /> Подложка</span>
            </button>
            <button type="button" onClick={() => setSection('data')} className={`min-h-11 rounded-md px-3 text-xs font-semibold ${section === 'data' ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]' : 'text-[var(--ls-muted)] hover:bg-[#fbfdfb]'}`}>
              <span className="flex items-center justify-center gap-1.5"><Layers className="h-4 w-4" aria-hidden="true" /> Слои данных</span>
            </button>
          </div>

          {section === 'basemap' ? (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              <p className="px-2 pb-2 text-[11px] text-[var(--ls-muted)]">Карта с подписями и спутниковой подложкой</p>
              <div className="grid gap-1">
                {BASE_LAYERS.map((layer) => {
                  const Icon = BASE_ICONS[layer.id as keyof typeof BASE_ICONS] || Map
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => { switchLayer(layer.id); setOpen(false) }}
                      className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-xs sm:text-sm ${currentLayer === layer.id ? 'bg-[#e4f1ec] font-semibold text-[var(--ls-green-dark)]' : 'text-[var(--ls-ink)] hover:bg-[#fbfdfb]'}`}
                    >
                      <Icon className="h-4 w-4 text-[var(--ls-muted)]" aria-hidden="true" />
                      <span className="truncate">{layer.name}</span>
                      {currentLayer === layer.id && <span className="ml-auto text-[10px]">Текущая</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-3">
              <div className="flex items-start gap-2 border-b border-[var(--ls-line)] pb-3">
                <input
                  id="osm-roads"
                  type="checkbox"
                  checked={showRoads}
                  aria-label="Показать дороги OpenStreetMap"
                  onChange={(event) => toggleRoads(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
                />
                <Route className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ls-green)]" aria-hidden="true" />
                <label htmlFor="osm-roads" className="min-w-0 text-xs font-semibold text-[var(--ls-ink)]">
                  Дороги
                  <span className="mt-0.5 block text-[10px] font-normal text-[var(--ls-muted)]">Нейтральный асфальт · OpenStreetMap</span>
                </label>
              </div>
              <div className="flex items-start gap-2 border-b border-[var(--ls-line)] pb-3">
                <input
                  id="tatarstan-cadastre"
                  type="checkbox"
                  checked={showTatarstanCadastre}
                  aria-label="Показать кадастр Татарстана"
                  onChange={(event) => toggleMaster(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
                />
                <label htmlFor="tatarstan-cadastre" className="min-w-0 text-xs font-semibold text-[var(--ls-ink)]">
                  Кадастр Татарстана
                  <span className="mt-0.5 block text-[10px] font-normal text-[var(--ls-muted)]">Официальные слои NSPD</span>
                </label>
              </div>
              <div className="mt-2 grid gap-1">
                {DATA_LAYERS.map(({ key, label, source, Icon }) => (
                  <label key={key} className={`flex min-h-11 items-center gap-2 rounded-md px-2 text-xs ${showTatarstanCadastre ? 'text-[var(--ls-ink)] hover:bg-[#fbfdfb]' : 'text-[var(--ls-muted)]'}`}>
                    <input type="checkbox" checked={showTatarstanCadastre && nspdLayerVisibility[key]} disabled={!showTatarstanCadastre} onChange={() => toggleDataLayer(key)} className="h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]" />
                    <Icon className="h-4 w-4 shrink-0 text-[var(--ls-green)]" aria-hidden="true" />
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-[var(--ls-muted)]">{source}</span>
                  </label>
                ))}
              </div>
              <label className="mt-3 block border-t border-[var(--ls-line)] pt-3 text-[11px] font-semibold text-[var(--ls-ink)]">
                Прозрачность слоёв
                <input type="range" min="0.2" max="1" step="0.05" value={nspdOpacity} onChange={(event) => onNspdOpacityChange?.(Number(event.target.value))} className="mt-2 w-full accent-[var(--ls-green)]" aria-label="Прозрачность слоёв NSPD" />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
