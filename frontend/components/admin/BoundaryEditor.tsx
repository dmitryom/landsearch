'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import maplibregl, { type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Check, Circle, Eraser, MousePointer2, RotateCcw, Save, Undo2 } from 'lucide-react'
import { api, type Settlement, type SettlementBoundaryMode } from '@/lib/api'
import { BASE_LAYERS, DEFAULT_BASE_LAYER_ID, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { addRoadLayers } from '@/lib/road-map-layers'
import { buildPlotTileUrl } from '@/lib/map-tiles'
import { getGeometryBounds } from '@/lib/plot-bounds'

type Point = [number, number]
type DrawingMode = 'polygon' | 'radius' | null
type BoundaryGeometry = Record<string, unknown>

interface BoundaryEditorProps {
  settlement: Settlement
  onSaved: (settlement: Settlement) => void
}

const SOURCE_ID = 'admin-boundary'
const LAYER_ID = 'admin-boundary-line'

function featureCollection(geometry: BoundaryGeometry | null) {
  return {
    type: 'FeatureCollection' as const,
    features: geometry ? [{ type: 'Feature' as const, geometry, properties: {} }] : [],
  }
}

function polygonFromPoints(points: Point[]): BoundaryGeometry | null {
  if (points.length < 3) return null
  return { type: 'Polygon', coordinates: [[...points, points[0]]] }
}

function polygonPoints(geometry?: BoundaryGeometry): Point[] {
  if (!geometry || geometry.type !== 'Polygon') return []
  const coordinates = geometry.coordinates as Point[][] | undefined
  const ring = coordinates?.[0] || []
  return ring.length > 1 ? ring.slice(0, -1) : ring
}

function circleFromCenter(center: Point, radiusM: number): BoundaryGeometry {
  const points: Point[] = []
  const latRadians = center[1] * Math.PI / 180
  const latDelta = radiusM / 111_320
  const lngDelta = radiusM / (111_320 * Math.max(Math.cos(latRadians), 0.15))
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2
    points.push([center[0] + Math.cos(angle) * lngDelta, center[1] + Math.sin(angle) * latDelta])
  }
  return { type: 'Polygon', coordinates: [points] }
}

function formatPoint(point: Point): string {
  return `Ш: ${point[1].toFixed(6)} · Д: ${point[0].toFixed(6)}`
}

function createBoundaryPointElement(index: number, point: Point, isCenter = false): HTMLDivElement {
  const element = document.createElement('div')
  element.className = `ls-boundary-point${isCenter ? ' ls-boundary-point-center' : ''}`
  element.setAttribute('aria-label', `${isCenter ? 'Центр радиуса' : `Точка ${index + 1}`} · Координаты ${formatPoint(point)}`)
  element.title = formatPoint(point)

  const badge = document.createElement('span')
  badge.className = 'ls-boundary-point-badge'
  badge.textContent = isCenter ? 'Ц' : String(index + 1)

  const label = document.createElement('span')
  label.className = 'ls-boundary-coordinate-label'
  label.textContent = formatPoint(point)

  element.append(badge, label)
  return element
}

function modeLabel(mode: SettlementBoundaryMode | null): string {
  if (mode === 'radius') return 'Радиус'
  if (mode === 'polygon') return 'Полигон'
  return 'Нет'
}

export default function BoundaryEditor({ settlement, onSaved }: BoundaryEditorProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])
  const modeRef = useRef<DrawingMode>(null)
  const pointsRef = useRef<Point[]>([])
  const centerRef = useRef<Point | null>(null)
  const radiusRef = useRef(settlement.boundary_radius_m ?? 500)
  const initialGeometryRef = useRef(settlement.geometry)
  const [mapReady, setMapReady] = useState(false)
  const [mode, setMode] = useState<DrawingMode>(null)
  const [draftMode, setDraftMode] = useState<'polygon' | 'radius'>(settlement.boundary_source === 'manual_radius' ? 'radius' : 'polygon')
  const [points, setPoints] = useState<Point[]>([])
  const [center, setCenter] = useState<Point | null>(null)
  const [radiusM, setRadiusM] = useState(settlement.boundary_radius_m ?? 500)
  const [draftGeometry, setDraftGeometry] = useState<BoundaryGeometry | null>(settlement.geometry || null)
  const [preview, setPreview] = useState<{ plot_count: number; by_status: Record<string, number> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const renderBoundary = useCallback((geometry: BoundaryGeometry | null) => {
    const map = mapRef.current
    if (!map || !mapReady || !map.isStyleLoaded()) return
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(featureCollection(geometry) as any)
  }, [mapReady])

  const clearMarkers = useCallback(() => {
    for (const marker of markerRefs.current) marker.remove()
    markerRefs.current = []
  }, [])

  const updatePolygonPoints = useCallback((nextPoints: Point[]) => {
    pointsRef.current = nextPoints
    setPoints(nextPoints)
    const geometry = polygonFromPoints(nextPoints)
    if (geometry) setDraftGeometry(geometry)
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    const bounds = getGeometryBounds(initialGeometryRef.current)
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASE_LAYERS.find((layer) => layer.id === DEFAULT_BASE_LAYER_ID)!.style,
      center: bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] : [50.1, 55.7],
      zoom: bounds ? 12 : 8,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const onLoad = () => {
      addRoadLayers(map, true)
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: 'geojson', data: featureCollection(initialGeometryRef.current || null) as any })
        map.addLayer({
          id: LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#237a63', 'line-width': 4, 'line-dasharray': [2, 1], 'line-opacity': 0.95 },
        })
      }
      map.addSource('admin-plots', { type: 'vector', tiles: [buildPlotTileUrl({ settlement_id: settlement.id })], minzoom: 8, maxzoom: 18 })
      map.addLayer({
        id: 'admin-plots-fill', type: 'fill', source: 'admin-plots', 'source-layer': 'plots',
        paint: { 'fill-color': ['match', ['get', 'status'], 'free', STATUS_COLORS.free, 'reserved', STATUS_COLORS.reserved, 'booked', STATUS_COLORS.booked, 'sold', STATUS_COLORS.sold, '#9ca3af'] as any, 'fill-opacity': 0.32 },
      })
      map.addLayer({
        id: 'admin-plots-border', type: 'line', source: 'admin-plots', 'source-layer': 'plots', minzoom: 13,
        paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.9 },
      })
      if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 })
      setMapReady(true)
    }

    const onClick = (event: MapMouseEvent) => {
      if (modeRef.current === 'polygon') {
        updatePolygonPoints([...pointsRef.current, [event.lngLat.lng, event.lngLat.lat]])
      } else if (modeRef.current === 'radius' && !centerRef.current) {
        const nextCenter: Point = [event.lngLat.lng, event.lngLat.lat]
        centerRef.current = nextCenter
        setCenter(nextCenter)
        setDraftGeometry(circleFromCenter(nextCenter, radiusRef.current))
      }
    }
    map.on('load', onLoad)
    map.on('click', onClick)

    return () => {
      map.off('load', onLoad)
      map.off('click', onClick)
      clearMarkers()
      map.remove()
      mapRef.current = null
    }
  }, [clearMarkers, settlement.id, updatePolygonPoints])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    centerRef.current = center
  }, [center])

  useEffect(() => {
    radiusRef.current = radiusM
  }, [radiusM])

  useEffect(() => {
    if (!center || draftMode !== 'radius') return
    setDraftGeometry(circleFromCenter(center, radiusM))
  }, [center, draftMode, radiusM])

  useEffect(() => {
    renderBoundary(draftGeometry)
  }, [draftGeometry, renderBoundary])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    clearMarkers()
    if (draftMode === 'polygon') {
      for (const [index, point] of points.entries()) {
        const marker = new maplibregl.Marker({
          element: createBoundaryPointElement(index, point),
          anchor: 'center',
          draggable: mode === 'polygon',
        })
          .setLngLat(point)
          .addTo(map)
        marker.on('dragend', () => {
          const next = [...pointsRef.current]
          const lngLat = marker.getLngLat()
          next[index] = [lngLat.lng, lngLat.lat]
          updatePolygonPoints(next)
        })
        markerRefs.current.push(marker)
      }
      return
    }

    if (draftMode === 'radius' && center) {
      markerRefs.current.push(
        new maplibregl.Marker({
          element: createBoundaryPointElement(0, center, true),
          anchor: 'center',
        })
          .setLngLat(center)
          .addTo(map),
      )
    }
  }, [center, clearMarkers, draftMode, mapReady, mode, points, updatePolygonPoints])

  const startPolygon = (newContour: boolean) => {
    if (!newContour && settlement.geometry?.type !== 'Polygon') {
      setError('Текущая граница состоит из нескольких полигонов. Для ее сохранения используйте новый контур или режим сброса.')
      return
    }
    const existing = newContour ? [] : polygonPoints(settlement.geometry)
    setDraftMode('polygon')
    setMode('polygon')
    setCenter(null)
    centerRef.current = null
    pointsRef.current = existing
    setPoints(existing)
    setDraftGeometry(newContour ? null : polygonFromPoints(existing))
    setPreview(null)
    setMessage('Кликайте по карте, чтобы добавить вершины границы')
    setError('')
  }

  const startRadius = () => {
    setDraftMode('radius')
    setMode('radius')
    setPoints([])
    pointsRef.current = []
    setCenter(null)
    centerRef.current = null
    setDraftGeometry(null)
    setPreview(null)
    setMessage('Кликните на карту, чтобы выбрать центр радиуса')
    setError('')
  }

  const finishPolygon = () => {
    if (points.length < 3) {
      setError('Для границы нужно минимум 3 точки')
      return
    }
    setMode(null)
    setMessage('Контур готов к предпросмотру и сохранению')
  }

  const payload = (): { mode: 'polygon' | 'radius'; geometry: BoundaryGeometry; radius_m?: number } | null => {
    if (!draftGeometry) return null
    return draftMode === 'radius'
      ? { mode: 'radius', geometry: draftGeometry, radius_m: radiusM }
      : { mode: 'polygon', geometry: draftGeometry }
  }

  const handlePreview = async () => {
    const data = payload()
    if (!data) return setError('Сначала нарисуйте границу')
    setBusy(true)
    setError('')
    try {
      setPreview(await api.settlements.previewBoundary(settlement.id, data))
      setMessage('Предпросмотр обновлен')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось посчитать участки')
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    const data = payload()
    if (!data) return setError('Сначала нарисуйте границу')
    setBusy(true)
    setError('')
    try {
      const result = await api.settlements.updateBoundary(settlement.id, data)
      onSaved({ ...settlement, geometry: result.geometry || undefined, boundary_source: result.boundary_source, boundary_radius_m: result.boundary_radius_m, boundary_updated_at: result.boundary_updated_at, stats: settlement.stats ? { ...settlement.stats, total_plots: result.plot_count, free_plots: result.by_status.free || 0, reserved_plots: result.by_status.reserved || 0, booked_plots: result.by_status.booked || 0, sold_plots: result.by_status.sold || 0 } : settlement.stats })
      setMode(null)
      setMessage(`Граница сохранена: ${result.plot_count} участков полностью внутри. Привязано NSPD: ${result.linked_plot_count || 0}, отвязано за границей: ${result.unlinked_plot_count || 0}`)
      setPreview(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить границу')
    } finally {
      setBusy(false)
    }
  }

  const handleNspdImport = async () => {
    if (!settlement.geometry) return
    setBusy(true)
    setError('')
    try {
      const result = await api.settlements.importNspdPlots(settlement.id)
      const data = payload()
      if (data) {
        const nextPreview = await api.settlements.previewBoundary(settlement.id, data)
        setPreview(nextPreview)
      }
      const refreshed = await api.settlements.get(settlement.id, { include_plots: false })
      onSaved(refreshed)
      setMessage('NSPD: найдено ' + result.found + ', добавлено ' + result.imported + ', обновлено ' + result.updated + ', не полностью внутри ' + result.excluded + ', отвязано за границей ' + result.unlinked + ', пропущено ' + result.skipped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать участки NSPD')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api.settlements.updateBoundary(settlement.id, { mode: 'clear' })
      setDraftGeometry(null)
      setPoints([])
      setCenter(null)
      setPreview(null)
      onSaved({ ...settlement, geometry: undefined, boundary_source: null, boundary_radius_m: null, boundary_updated_at: result.boundary_updated_at })
      setMessage('Граница сброшена')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сбросить границу')
    } finally {
      setBusy(false)
    }
  }

  const handleMapSurfaceClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const map = mapRef.current
    if (!map || !mode) return
    const rect = map.getContainer().getBoundingClientRect()
    const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
    if (mode === 'polygon') {
      updatePolygonPoints([...pointsRef.current, [lngLat.lng, lngLat.lat]])
      return
    }
    if (mode === 'radius' && !centerRef.current) {
      const nextCenter: Point = [lngLat.lng, lngLat.lat]
      centerRef.current = nextCenter
      setCenter(nextCenter)
      setDraftGeometry(circleFromCenter(nextCenter, radiusRef.current))
      setMessage('Центр выбран. Радиус можно менять без повторного клика')
    }
  }

  const statusRows = preview ? Object.entries(STATUS_LABELS).map(([status, label]) => ({ status, label, count: preview.by_status[status] || 0 })) : []

  return (
    <section className="grid min-h-[640px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-[var(--ls-line)] bg-white shadow-sm">
        <div className="absolute inset-0"><div ref={mapContainerRef} className="h-full w-full" /></div>
        {mode && <div aria-label="Область рисования границы" className="absolute inset-0 z-[5] cursor-crosshair" onClick={handleMapSurfaceClick} />}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-600 shadow-sm backdrop-blur-sm">
          <MousePointer2 className="h-4 w-4 text-[var(--ls-green)]" />
          {mode ? (mode === 'polygon' ? 'Режим полигона' : 'Режим радиуса') : 'Выберите режим рисования'}
        </div>
      </div>

      <aside className="flex flex-col gap-4 rounded-lg border border-[var(--ls-line)] bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">Граница территории</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ls-ink)]">{settlement.name}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ls-muted)]">Кадастровая сетка на публичной карте будет ограничена сохраненным контуром.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => startPolygon(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--ls-green-dark)]">
            <MousePointer2 className="h-4 w-4" /> Нарисовать полигон
          </button>
          <button type="button" onClick={startRadius} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ls-line)] px-3 py-2 text-xs font-semibold text-[var(--ls-ink)] hover:bg-[var(--ls-paper)]">
            <Circle className="h-4 w-4" /> Радиус
          </button>
        </div>

        {settlement.geometry?.type === 'Polygon' && (
          <button type="button" onClick={() => startPolygon(false)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[var(--ls-line)] px-3 py-2 text-xs font-medium text-[var(--ls-muted)] hover:bg-[var(--ls-paper)]">
            <RotateCcw className="h-4 w-4" /> Редактировать текущий контур
          </button>
        )}
        {settlement.geometry?.type === 'MultiPolygon' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Текущий мультиполигон сохранен. Редактор точек доступен для нового контура, чтобы не потерять части существующей границы.</p>
        )}

        {draftMode === 'radius' && mode === 'radius' && (
          <label className="block text-xs font-medium text-gray-600">
            Радиус, м
            <input type="number" min={0} max={100000} step={10} value={radiusM} onChange={(event) => setRadiusM(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm" />
          </label>
        )}

        {mode === 'polygon' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ls-muted)]">Точек: {points.length}</span>
            <button type="button" onClick={() => updatePolygonPoints(points.slice(0, -1))} disabled={!points.length} title="Удалить последнюю точку" aria-label="Удалить последнюю точку" className="ml-auto rounded-md border border-[var(--ls-line)] p-2 text-[var(--ls-muted)] disabled:opacity-40">
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={finishPolygon} disabled={points.length < 3} className="rounded-md bg-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Готово</button>
          </div>
        )}

        {mode === 'radius' && center && <p className="text-xs text-[var(--ls-muted)]">Центр выбран. Радиус можно менять без повторного клика.</p>}
        {message && <p className="rounded-md bg-[#e4f1ec] px-3 py-2 text-xs text-[var(--ls-green-dark)]">{message}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="mt-auto space-y-2 border-t border-[var(--ls-line)] pt-4">
          <button type="button" onClick={handlePreview} disabled={busy || !draftGeometry} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-[var(--ls-green-dark)] disabled:opacity-40">
            <Check className="h-4 w-4" /> Посчитать полностью внутри
          </button>
          <button type="button" onClick={handleSave} disabled={busy || !draftGeometry} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--ls-green-dark)] disabled:opacity-40">
            <Save className="h-4 w-4" /> Сохранить границу
          </button>
          <button type="button" onClick={handleNspdImport} disabled={busy || !settlement.geometry} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--ls-blue)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ls-blue)] hover:bg-blue-50 disabled:opacity-40">
            Импортировать участки NSPD полностью внутри
          </button>
          <button type="button" onClick={handleClear} disabled={busy || !settlement.geometry} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">
            <Eraser className="h-4 w-4" /> Сбросить границу
          </button>
        </div>

        {preview && (
          <div className="rounded-md border border-[var(--ls-line)] bg-[var(--ls-paper)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--ls-muted)]">Участков полностью внутри</span>
              <strong className="text-xl text-[var(--ls-ink)]">{preview.plot_count}</strong>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
              {statusRows.map((row) => <span key={row.status} style={{ color: STATUS_COLORS[row.status] }}>{row.label}: {row.count}</span>)}
            </div>
            {preview.plot_count === 0 && (
              <p className="mt-3 border-t border-[var(--ls-line)] pt-2 text-[11px] leading-4 text-[var(--ls-muted)]">
                В этой области пока нет импортированных геометрий участков. Кадастровый слой NSPD на карте отображается отдельно и не участвует в этом счётчике.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] leading-4 text-[var(--ls-muted)]">Текущий режим: {modeLabel(draftMode)}. Для радиуса сначала выберите центр на карте. Счётчик и импорт включают только участки, вся геометрия которых находится внутри границы; NSPD на карте является отдельным визуальным слоем.</p>
      </aside>
    </section>
  )
}
