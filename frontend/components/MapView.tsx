'use client'

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { BASE_LAYERS } from '@/lib/constants'
import { log } from '@/lib/logger'
import { buildPlotTileUrl } from '@/lib/map-tiles'
import { addPlotTileLayers, updatePlotTileUrl } from '@/lib/plot-map-layers'

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

  return longitudeSpan < 0.01 && latitudeSpan < 0.01 ? 17 : 15
}

export interface MapViewHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void
}

export default function MapView({
  onMapReady,
  onPlotClick,
  mapRef,
  filters = {},
  resultBounds = null,
}: {
  onMapReady?: (map: maplibregl.Map) => void
  onPlotClick?: (props: Record<string, any>) => void
  mapRef?: React.MutableRefObject<maplibregl.Map | null>
  filters?: Record<string, string>
  resultBounds?: maplibregl.LngLatBoundsLike | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalMapRef = useRef<maplibregl.Map | null>(null)
  const mapReadyRef = useRef(false)
  const onMapReadyRef = useRef(onMapReady)
  const onPlotClickRef = useRef(onPlotClick)
  const tileUrl = useMemo(() => buildPlotTileUrl(filters), [filters])
  const tileUrlRef = useRef(tileUrl)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => { onMapReadyRef.current = onMapReady }, [onMapReady])
  useEffect(() => { onPlotClickRef.current = onPlotClick }, [onPlotClick])
  useEffect(() => { tileUrlRef.current = tileUrl }, [tileUrl])

  useEffect(() => {
    const map = internalMapRef.current
    if (!map || !mapLoaded || !resultBounds) return
    const compactViewport = map.getContainer().clientWidth < 768
    map.fitBounds(resultBounds, {
      padding: compactViewport
        ? { top: 64, right: 32, bottom: 112, left: 32 }
        : { top: 72, right: 72, bottom: 256, left: 320 },
      maxZoom: getFitBoundsMaxZoom(resultBounds),
      duration: 700,
    })
  }, [mapLoaded, resultBounds])

  const initMapLayers = useCallback((map: maplibregl.Map) => {
    log('map', 'Добавление MVT tile слоёв')
    addPlotTileLayers(map, tileUrlRef.current)
    map.on('click', 'plots-fill', (e) => {
      if (e.features?.[0]) onPlotClickRef.current?.(e.features[0].properties as Record<string, any>)
    })
    map.on('click', 'plots-points', (e) => {
      if (e.features?.[0]) onPlotClickRef.current?.(e.features[0].properties as Record<string, any>)
    })
    map.on('mouseenter', 'plots-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'plots-fill', () => { map.getCanvas().style.cursor = '' })
    map.on('mouseenter', 'plots-points', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'plots-points', () => { map.getCanvas().style.cursor = '' })
  }, [])

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

      map.on('error', (e) => {
        if (isAbortError(e.error)) return
        const detail = e as any
        log('error', 'MapLibre error', `${e.error?.message || 'unknown'}\nsource=${detail.sourceId || 'none'}\ntile=${detail.tile?.url || 'none'}`)
      })

      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      map.addControl(new maplibregl.FullscreenControl(), 'top-right')

      map.on('load', () => {
        if (!mounted) return
        log('map', `Map LOAD event fired after ${Math.round(performance.now())}ms`)
        mapReadyRef.current = true
        setMapLoaded(true)
        initMapLayers(map)
        onMapReadyRef.current?.(map)
      })

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
  }, [initMapLayers, mapRef])

  return <div ref={containerRef} className="w-full h-full" />
}
