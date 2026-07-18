'use client'

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, type Plot } from '@/lib/api'
import { BASE_LAYERS, plotFillColor, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { log } from '@/lib/logger'
import { buildPlotTileUrl } from '@/lib/map-tiles'
import { addPlotTileLayers, DEFAULT_NSPD_LAYER_VISIBILITY, setTatarstanCadastreLayer, updatePlotTileUrl, type NspdLayerVisibility } from '@/lib/plot-map-layers'
import { addRoadLayers, setRoadLayerVisibility } from '@/lib/road-map-layers'
import { addPoiLayers, removePoiLayers, setPoiLayerVisibility, updatePoiData } from '@/lib/settlement-pois'
import MapOrientationControls from '@/components/MapOrientationControls'

const SELECTED_PLOT_SOURCE_ID = 'selected-plot'
const SELECTED_PLOT_FILL_ID = 'selected-plot-fill'
const SELECTED_PLOT_BORDER_ID = 'selected-plot-border'
const SETTLEMENT_BOUNDARY_SOURCE_ID = 'selected-settlement-boundary'
const SETTLEMENT_BOUNDARY_LAYER_ID = 'selected-settlement-boundary'

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

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: string; message?: string }
  return name === 'AbortError' || message === 'AbortError'
}

function getFitBoundsMaxZoom(bounds: maplibregl.LngLatBoundsLike): number {
  if (!Array.isArray(bounds) || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) return 15

  const [southWest, northEast] = bounds
  if (
    !Array.isArray(southWest)
    || !Array.isArray(northEast)
    || southWest.length < 2
    || northEast.length < 2
  ) return 15

  const longitudeSpan = Math.abs(Number(northEast[0]) - Number(southWest[0]))
  const latitudeSpan = Math.abs(Number(northEast[1]) - Number(southWest[1]))
  if (!Number.isFinite(longitudeSpan) || !Number.isFinite(latitudeSpan)) return 15

  return longitudeSpan < 0.01 && latitudeSpan < 0.01 ? 16 : 15
}

export interface MapViewHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void
}

type SelectedPlot = Partial<Plot> & { id?: string; use?: string; vri_code?: string }

function selectedPlotData(plot: SelectedPlot) {
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: plot.geometry,
      properties: { id: plot.id, status: plot.status },
    }],
  }
}

function settlementBoundaryData(geometry: Record<string, unknown>) {
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry,
      properties: {},
    }],
  }
}

export default function MapView({
  onMapReady,
  onPlotClick,
  mapRef,
  filters = {},
  resultBounds = null,
  boundaryGeometry = null,
  selectedPlot = null,
  showRoads = true,
  showSettlementPois = true,
  showTatarstanCadastre = false,
  nspdLayerVisibility = DEFAULT_NSPD_LAYER_VISIBILITY,
  nspdOpacity = 1,
  resultTrayHeight = 248,
}: {
  onMapReady?: (map: maplibregl.Map) => void
  onPlotClick?: (props: Record<string, any>) => void
  mapRef?: React.MutableRefObject<maplibregl.Map | null>
  filters?: Record<string, string>
  resultBounds?: maplibregl.LngLatBoundsLike | null
  boundaryGeometry?: Record<string, unknown> | null
  selectedPlot?: SelectedPlot | null
  showRoads?: boolean
  showSettlementPois?: boolean
  showTatarstanCadastre?: boolean
  nspdLayerVisibility?: NspdLayerVisibility
  nspdOpacity?: number
  resultTrayHeight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalMapRef = useRef<maplibregl.Map | null>(null)
  const mapReadyRef = useRef(false)
  const onMapReadyRef = useRef(onMapReady)
  const onPlotClickRef = useRef(onPlotClick)
  const selectedPlotRef = useRef<SelectedPlot | null>(selectedPlot)
  const boundaryGeometryRef = useRef<Record<string, unknown> | null>(boundaryGeometry)
  const selectedMarkerRef = useRef<maplibregl.Marker | null>(null)
  const showRoadsRef = useRef(showRoads)
  const showSettlementPoisRef = useRef(showSettlementPois)
  const showTatarstanCadastreRef = useRef(showTatarstanCadastre)
  const nspdLayerVisibilityRef = useRef(nspdLayerVisibility)
  const nspdOpacityRef = useRef(nspdOpacity)
  const tileUrl = useMemo(() => buildPlotTileUrl(filters), [filters])
  const tileUrlRef = useRef(tileUrl)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => { onMapReadyRef.current = onMapReady }, [onMapReady])
  useEffect(() => { onPlotClickRef.current = onPlotClick }, [onPlotClick])
  useEffect(() => { selectedPlotRef.current = selectedPlot }, [selectedPlot])
  useEffect(() => { boundaryGeometryRef.current = boundaryGeometry }, [boundaryGeometry])
  useEffect(() => { showRoadsRef.current = showRoads }, [showRoads])
  useEffect(() => { showSettlementPoisRef.current = showSettlementPois }, [showSettlementPois])
  useEffect(() => { showTatarstanCadastreRef.current = showTatarstanCadastre }, [showTatarstanCadastre])
  useEffect(() => { nspdLayerVisibilityRef.current = nspdLayerVisibility }, [nspdLayerVisibility])
  useEffect(() => { nspdOpacityRef.current = nspdOpacity }, [nspdOpacity])
  useEffect(() => { tileUrlRef.current = tileUrl }, [tileUrl])

  const removeSelectedPlotLayers = useCallback((map: maplibregl.Map) => {
    for (const layerId of [SELECTED_PLOT_BORDER_ID, SELECTED_PLOT_FILL_ID]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
    }
    if (map.getSource(SELECTED_PLOT_SOURCE_ID)) map.removeSource(SELECTED_PLOT_SOURCE_ID)
  }, [])

  const renderSelectedPlot = useCallback((map: maplibregl.Map, plot: SelectedPlot | null) => {
    if (!map.isStyleLoaded()) return
    if (!plot?.geometry) {
      removeSelectedPlotLayers(map)
      return
    }

    const status = String(plot.status || '')
    const fillColor = plotFillColor(status, plot.vri_code || plot.permitted_use || plot.use)
    const source = map.getSource(SELECTED_PLOT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(selectedPlotData(plot) as any)
    else map.addSource(SELECTED_PLOT_SOURCE_ID, { type: 'geojson', data: selectedPlotData(plot) as any })

    if (!map.getLayer(SELECTED_PLOT_FILL_ID)) {
      map.addLayer({
        id: SELECTED_PLOT_FILL_ID,
        type: 'fill',
        source: SELECTED_PLOT_SOURCE_ID,
        paint: { 'fill-color': fillColor, 'fill-opacity': 0.26 },
      })
    } else {
      map.setPaintProperty(SELECTED_PLOT_FILL_ID, 'fill-color', fillColor)
    }

    if (!map.getLayer(SELECTED_PLOT_BORDER_ID)) {
      map.addLayer({
        id: SELECTED_PLOT_BORDER_ID,
        type: 'line',
        source: SELECTED_PLOT_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3269a5', 'line-width': 4, 'line-opacity': 1 },
      })
    } else {
      map.setPaintProperty(SELECTED_PLOT_BORDER_ID, 'line-color', '#3269a5')
    }
  }, [removeSelectedPlotLayers])

  const removeBoundaryLayer = useCallback((map: maplibregl.Map) => {
    if (map.getLayer(SETTLEMENT_BOUNDARY_LAYER_ID)) map.removeLayer(SETTLEMENT_BOUNDARY_LAYER_ID)
    if (map.getSource(SETTLEMENT_BOUNDARY_SOURCE_ID)) map.removeSource(SETTLEMENT_BOUNDARY_SOURCE_ID)
  }, [])

  const renderBoundary = useCallback((map: maplibregl.Map, geometry: Record<string, unknown> | null) => {
    if (!map.isStyleLoaded()) return
    if (!geometry) {
      removeBoundaryLayer(map)
      return
    }

    const data = settlementBoundaryData(geometry) as any
    const source = map.getSource(SETTLEMENT_BOUNDARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(data)
    else map.addSource(SETTLEMENT_BOUNDARY_SOURCE_ID, { type: 'geojson', data })

    if (!map.getLayer(SETTLEMENT_BOUNDARY_LAYER_ID)) {
      map.addLayer({
        id: SETTLEMENT_BOUNDARY_LAYER_ID,
        type: 'line',
        source: SETTLEMENT_BOUNDARY_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#237a63',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 1],
        },
      })
    }
  }, [removeBoundaryLayer])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded || !resultBounds) return
    const compactViewport = map.getContainer().clientWidth < 768
    map.fitBounds(resultBounds, {
      padding: compactViewport
        ? { top: 72, right: 32, bottom: selectedPlot ? 280 : Math.min(resultTrayHeight + 32, 420), left: 32 }
        : { top: 72, right: selectedPlot ? 400 : 72, bottom: Math.min(resultTrayHeight + 32, 560), left: 32 },
      maxZoom: getFitBoundsMaxZoom(resultBounds),
      duration: 700,
    })
  }, [mapLoaded, resultBounds, resultTrayHeight, selectedPlot])

  const initMapLayers = useCallback((map: maplibregl.Map) => {
    log('map', 'Добавление MVT tile слоёв')
    addPlotTileLayers(map, tileUrlRef.current)
    addRoadLayers(map, showRoadsRef.current, 'plots-border')
    addPoiLayers(map)
    setPoiLayerVisibility(map, showSettlementPoisRef.current)
    setTatarstanCadastreLayer(map, showTatarstanCadastreRef.current, nspdLayerVisibilityRef.current, nspdOpacityRef.current)
    renderBoundary(map, boundaryGeometryRef.current)
    for (const layerId of ['plots-fill', 'plots-point-fallback']) {
      map.on('click', layerId, (e) => {
        if (e.features?.[0]) onPlotClickRef.current?.(e.features[0].properties as Record<string, any>)
      })
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
    }
  }, [renderBoundary])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapReadyRef.current) return
    if (updatePlotTileUrl(map, tileUrl)) return
    if (map.isStyleLoaded()) initMapLayers(map)
  }, [initMapLayers, tileUrl])

  useEffect(() => {
    if (!containerRef.current || internalMapRef.current) return
    let mounted = true
    log('map', 'Начало инициализации карты')
    log('webgl', 'WebGL check', detectWebGL())

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_LAYERS[0]!.style,
        center: [38.12, 55.57],
        zoom: 12,
      })
      log('map', 'Map object created')

      let poiAbortController: AbortController | null = null
      let poiMoveTimer: ReturnType<typeof setTimeout> | null = null
      const fetchPoiData = () => {
        if (!mounted || !mapReadyRef.current) return
        const bounds = map.getBounds()
        const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
        poiAbortController?.abort()
        const controller = new AbortController()
        poiAbortController = controller
        api.pois.geo({ bbox, signal: controller.signal })
          .then((data) => {
            if (mounted && poiAbortController === controller) updatePoiData(map, data)
          })
          .catch((error) => {
            if (!isAbortError(error)) log('error', 'POI request failed', String(error))
          })
      }
      const schedulePoiFetch = () => {
        if (poiMoveTimer) clearTimeout(poiMoveTimer)
        poiMoveTimer = setTimeout(fetchPoiData, 250)
      }

      map.on('error', (e) => {
        if (isAbortError(e.error)) return
        const detail = e as any
        log('error', 'MapLibre error', `${e.error?.message || 'unknown'}\nsource=${detail.sourceId || 'none'}\ntile=${detail.tile?.url || 'none'}`)
      })

      map.addControl(new maplibregl.FullscreenControl(), 'top-right')

      map.on('load', () => {
        if (!mounted) return
        log('map', `Map LOAD event fired after ${Math.round(performance.now())}ms`)
        mapReadyRef.current = true
        setMapLoaded(true)
        initMapLayers(map)
        fetchPoiData()
        map.on('moveend', schedulePoiFetch)
        onMapReadyRef.current?.(map)
      })

      let selectedRestoreTimer: ReturnType<typeof setTimeout> | null = null
      const restoreSelectedPlot = () => {
        if (!mounted) return
        addPlotTileLayers(map, tileUrlRef.current)
        addRoadLayers(map, showRoadsRef.current, 'plots-border')
        addPoiLayers(map)
        setPoiLayerVisibility(map, showSettlementPoisRef.current)
        setTatarstanCadastreLayer(map, showTatarstanCadastreRef.current, nspdLayerVisibilityRef.current, nspdOpacityRef.current)
        renderBoundary(map, boundaryGeometryRef.current)
        renderSelectedPlot(map, selectedPlotRef.current)
        if (selectedRestoreTimer) clearTimeout(selectedRestoreTimer)
        selectedRestoreTimer = setTimeout(() => {
          if (mounted) renderSelectedPlot(map, selectedPlotRef.current)
        }, 500)
      }
      map.on('style.load', restoreSelectedPlot)

      map.on('sourcedata', (e) => {
        if (e.isSourceLoaded) log('map', 'Source loaded', e.sourceId)
      })

      internalMapRef.current = map
      if (mapRef) mapRef.current = map

      const fallback = setTimeout(() => {
        if (mounted && !mapReadyRef.current) {
          log('error', 'TIMEOUT: map.on(load) не сработал за 15 сек')
          mapReadyRef.current = true
          setMapLoaded(true)
          onMapReadyRef.current?.(map)
        }
      }, 15000)

      return () => {
        mounted = false
        clearTimeout(fallback)
        if (poiMoveTimer) clearTimeout(poiMoveTimer)
        poiAbortController?.abort()
        map.off('moveend', schedulePoiFetch)
        if (selectedRestoreTimer) clearTimeout(selectedRestoreTimer)
        map.off('style.load', restoreSelectedPlot)
        selectedMarkerRef.current?.remove()
        selectedMarkerRef.current = null
        removePoiLayers(map)
        map.remove()
        internalMapRef.current = null
        mapReadyRef.current = false
        if (mapRef) mapRef.current = null
      }
    } catch (e: any) {
      log('error', 'Map init CRASH', `${e.message}\n${e.stack}`)
      mounted = false
      onMapReadyRef.current?.(null as any)
    }
  }, [initMapLayers, mapRef, renderBoundary, renderSelectedPlot])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return
    renderBoundary(map, boundaryGeometry)
  }, [boundaryGeometry, mapLoaded, renderBoundary])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return
    setTatarstanCadastreLayer(map, showTatarstanCadastre, nspdLayerVisibility, nspdOpacity)
  }, [mapLoaded, nspdLayerVisibility, nspdOpacity, showTatarstanCadastre])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return
    setRoadLayerVisibility(map, showRoads)
  }, [mapLoaded, showRoads])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return
    setPoiLayerVisibility(map, showSettlementPois)
  }, [mapLoaded, showSettlementPois])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded) return

    selectedMarkerRef.current?.remove()
    selectedMarkerRef.current = null
    renderSelectedPlot(map, selectedPlot)

    const lng = Number(selectedPlot?.center_lng)
    const lat = Number(selectedPlot?.center_lat)
    if (!selectedPlot || !Number.isFinite(lng) || !Number.isFinite(lat)) return

    const status = String(selectedPlot.status || '')
    const statusColor = STATUS_COLORS[status] || '#237a63'
    const statusLabel = STATUS_LABELS[status] || status || 'Статус не указан'
    const marker = new maplibregl.Marker({ color: statusColor })
      .setLngLat([lng, lat])
      .addTo(map)
    marker.getElement().setAttribute(
      'aria-label',
      `Участок ${selectedPlot.cadastral_number || selectedPlot.id || ''} — ${statusLabel}`,
    )
    selectedMarkerRef.current = marker
  }, [mapLoaded, renderSelectedPlot, selectedPlot])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {mapLoaded && internalMapRef.current && (
        <MapOrientationControls map={internalMapRef.current} hasSelectedPlot={Boolean(selectedPlot)} />
      )}
    </div>
  )
}
