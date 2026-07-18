'use client'

import { createRoot, type Root } from 'react-dom/client'
import {
  Baby,
  Coffee,
  Cross,
  DoorClosed,
  Dumbbell,
  Goal,
  Landmark,
  LogIn,
  LogOut,
  ParkingCircle,
  School,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import type { PoiFeatureCollection, PoiType } from '@/lib/api'

export const POI_SOURCE_ID = 'settlement-pois'
const POI_CLUSTER_LAYER_ID = 'settlement-poi-clusters'
const POI_CLUSTER_COUNT_LAYER_ID = 'settlement-poi-cluster-count'
const MARKER_REFRESH_DELAY_MS = 50

export const POI_TYPES = [
  'shop',
  'playground',
  'sports',
  'checkpoint',
  'entrance',
  'exit',
  'parking',
  'school',
  'kindergarten',
  'cafe',
  'medical',
  'sales_office',
  'other',
] as const satisfies readonly PoiType[]

export const POI_LABELS: Record<PoiType, string> = {
  shop: 'Магазин',
  playground: 'Детская площадка',
  sports: 'Спортивная площадка',
  checkpoint: 'КПП',
  entrance: 'Въезд',
  exit: 'Выезд',
  parking: 'Парковка',
  school: 'Школа',
  kindergarten: 'Детский сад',
  cafe: 'Кафе',
  medical: 'Медицинский пункт',
  sales_office: 'Офис продаж',
  other: 'Инфраструктура',
}

export const POI_COLORS: Record<PoiType, string> = {
  shop: '#2563eb',
  playground: '#db2777',
  sports: '#ea580c',
  checkpoint: '#475569',
  entrance: '#16a34a',
  exit: '#dc2626',
  parking: '#7c3aed',
  school: '#0891b2',
  kindergarten: '#f59e0b',
  cafe: '#a16207',
  medical: '#e11d48',
  sales_office: '#237a63',
  other: '#64748b',
}

const POI_ICONS: Record<PoiType, LucideIcon> = {
  shop: Store,
  playground: Goal,
  sports: Dumbbell,
  checkpoint: ShieldCheck,
  entrance: LogIn,
  exit: LogOut,
  parking: ParkingCircle,
  school: School,
  kindergarten: Baby,
  cafe: Coffee,
  medical: Cross,
  sales_office: Landmark,
  other: DoorClosed,
}

const EMPTY_POI_DATA: PoiFeatureCollection = { type: 'FeatureCollection', features: [] }

type PoiMarker = {
  marker: maplibregl.Marker
  root: Root
  element: HTMLButtonElement
  onClick: (event: MouseEvent) => void
  signature: string
}

type PoiLayerState = {
  data: PoiFeatureCollection
  visible: boolean
  markers: Map<string, PoiMarker>
  activePopup: maplibregl.Popup | null
  activePopupId: string | null
  markerRefreshTimer: number | null
  refreshMarkers: () => void
  scheduleMarkerRefresh: () => void
  sourceDataListener: (event: maplibregl.MapSourceDataEvent) => void
  clusterClickListener: (event: maplibregl.MapLayerMouseEvent) => void
  clusterMouseEnterListener: () => void
  clusterMouseLeaveListener: () => void
  interactionsRegistered: boolean
}

const states = new WeakMap<maplibregl.Map, PoiLayerState>()

function isPoiType(value: unknown): value is PoiType {
  return typeof value === 'string' && POI_TYPES.includes(value as PoiType)
}

function poiLabel(properties: Record<string, unknown>): string {
  const type = isPoiType(properties.poi_type) ? properties.poi_type : 'other'
  const customTypeLabel = typeof properties.custom_type_label === 'string' ? properties.custom_type_label.trim() : ''
  return type === 'other' && customTypeLabel ? customTypeLabel : POI_LABELS[type]
}

function markerLabel(properties: Record<string, unknown>): string {
  const name = typeof properties.name === 'string' && properties.name.trim() ? properties.name.trim() : 'Инфраструктура'
  const settlement = typeof properties.settlement_name === 'string' ? properties.settlement_name.trim() : ''
  return [name, poiLabel(properties), settlement].filter(Boolean).join(', ')
}

function clearActivePopup(state: PoiLayerState) {
  const popup = state.activePopup
  state.activePopup = null
  state.activePopupId = null
  popup?.remove()
}

function removeMarker(state: PoiLayerState, id: string, marker: PoiMarker) {
  if (state.activePopupId === id) clearActivePopup(state)
  marker.element.removeEventListener('click', marker.onClick)
  marker.root.unmount()
  marker.marker.remove()
}

function clearMarkers(state: PoiLayerState) {
  clearActivePopup(state)
  for (const [id, marker] of state.markers) removeMarker(state, id, marker)
  state.markers.clear()
}

function popupContent(properties: Record<string, unknown>): HTMLElement {
  const content = document.createElement('div')
  content.className = 'min-w-44 space-y-1 p-1 text-sm text-slate-800'

  const category = document.createElement('p')
  category.className = 'text-xs font-semibold text-slate-500'
  category.textContent = poiLabel(properties)
  content.append(category)

  const name = document.createElement('p')
  name.className = 'font-semibold'
  name.textContent = typeof properties.name === 'string' ? properties.name : 'Инфраструктура'
  content.append(name)

  if (typeof properties.description === 'string' && properties.description.trim()) {
    const description = document.createElement('p')
    description.className = 'text-xs text-slate-600'
    description.textContent = properties.description
    content.append(description)
  }

  if (typeof properties.settlement_name === 'string' && properties.settlement_name.trim()) {
    const settlement = document.createElement('p')
    settlement.className = 'pt-1 text-xs text-slate-500'
    settlement.textContent = properties.settlement_name
    content.append(settlement)
  }

  return content
}

function pointCoordinates(feature: maplibregl.MapGeoJSONFeature): [number, number] | null {
  if (feature.geometry.type !== 'Point') return null
  const coordinates = feature.geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}

function markerSignature(feature: maplibregl.MapGeoJSONFeature, coordinates: [number, number]): string {
  const properties = (feature.properties || {}) as Record<string, unknown>
  return JSON.stringify([
    coordinates,
    properties.poi_type,
    properties.custom_type_label,
    properties.name,
    properties.description,
    properties.settlement_name,
  ])
}

function createPoiMarker(
  map: maplibregl.Map,
  state: PoiLayerState,
  id: string,
  feature: maplibregl.MapGeoJSONFeature,
  coordinates: [number, number],
  signature: string,
): PoiMarker {
  const properties = (feature.properties || {}) as Record<string, unknown>
  const poiType = isPoiType(properties.poi_type) ? properties.poi_type : 'other'
  const Icon = POI_ICONS[poiType]
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2'
  const root = createRoot(element)
  root.render(<Icon size={16} color="white" strokeWidth={2.5} />)
  element.style.backgroundColor = POI_COLORS[poiType]

  const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
    .setLngLat(coordinates)
    .addTo(map)
  element.setAttribute('aria-label', markerLabel(properties))
  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    clearActivePopup(state)
    const popup = new maplibregl.Popup({ offset: 18, closeButton: true })
      .setLngLat(coordinates)
      .setDOMContent(popupContent(properties))
      .addTo(map)
    state.activePopup = popup
    state.activePopupId = id
    popup.on('close', () => {
      if (state.activePopup !== popup) return
      state.activePopup = null
      state.activePopupId = null
    })
  }
  element.addEventListener('click', onClick)
  return { marker, root, element, onClick, signature }
}

function addClusterLayers(map: maplibregl.Map) {
  if (!map.getLayer(POI_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: POI_CLUSTER_LAYER_ID,
      type: 'circle',
      source: POI_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#237a63',
        'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 50, 26],
        'circle-opacity': 0.92,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
  }
  if (!map.getLayer(POI_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: POI_CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: POI_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Bold'],
        'text-size': 12,
      },
      paint: { 'text-color': '#ffffff' },
    })
  }
}

function syncLayerVisibility(map: maplibregl.Map, visible: boolean) {
  const visibility = visible ? 'visible' : 'none'
  for (const layerId of [POI_CLUSTER_LAYER_ID, POI_CLUSTER_COUNT_LAYER_ID]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
}

function registerClusterInteractions(map: maplibregl.Map, state: PoiLayerState) {
  if (state.interactionsRegistered) return
  map.on('click', POI_CLUSTER_LAYER_ID, state.clusterClickListener)
  map.on('mouseenter', POI_CLUSTER_LAYER_ID, state.clusterMouseEnterListener)
  map.on('mouseleave', POI_CLUSTER_LAYER_ID, state.clusterMouseLeaveListener)
  state.interactionsRegistered = true
}

export function addPoiLayers(map: maplibregl.Map, data?: PoiFeatureCollection) {
  let state = states.get(map)
  if (!state) {
    const refreshMarkers = () => {
      const current = states.get(map)
      if (!current) return
      if (!current.visible || !map.getSource(POI_SOURCE_ID)) {
        clearMarkers(current)
        return
      }

      const nextFeatures = new Map<string, maplibregl.MapGeoJSONFeature>()
      for (const feature of map.querySourceFeatures(POI_SOURCE_ID, { filter: ['!', ['has', 'point_count']] })) {
        const properties = (feature.properties || {}) as Record<string, unknown>
        const id = typeof properties.id === 'string' ? properties.id : ''
        if (!id || !pointCoordinates(feature)) continue
        if (nextFeatures.has(id)) continue
        nextFeatures.set(id, feature)
      }

      for (const [id, marker] of current.markers) {
        if (!nextFeatures.has(id)) {
          removeMarker(current, id, marker)
          current.markers.delete(id)
        }
      }

      for (const [id, feature] of nextFeatures) {
        const coordinates = pointCoordinates(feature)
        if (!coordinates) continue
        const signature = markerSignature(feature, coordinates)
        const existing = current.markers.get(id)
        if (existing?.signature === signature) continue
        if (existing) {
          removeMarker(current, id, existing)
          current.markers.delete(id)
        }
        current.markers.set(id, createPoiMarker(map, current, id, feature, coordinates, signature))
      }
    }
    const scheduleMarkerRefresh = () => {
      const current = states.get(map)
      if (!current) return
      if (current.markerRefreshTimer) clearTimeout(current.markerRefreshTimer)
      current.markerRefreshTimer = window.setTimeout(() => {
        const latest = states.get(map)
        if (!latest) return
        latest.markerRefreshTimer = null
        latest.refreshMarkers()
      }, MARKER_REFRESH_DELAY_MS)
    }
    const sourceDataListener = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== POI_SOURCE_ID) return
      scheduleMarkerRefresh()
    }
    const clusterClickListener = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const coordinates = feature.geometry.coordinates
      const clusterId = Number(feature.properties?.cluster_id)
      const source = map.getSource(POI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (!source || !Number.isFinite(clusterId) || !Array.isArray(coordinates)) return
      source.getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          if (!states.has(map)) return
          map.easeTo({
            center: [Number(coordinates[0]), Number(coordinates[1])],
            zoom,
          })
        })
        .catch(() => undefined)
    }
    const clusterMouseEnterListener = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const clusterMouseLeaveListener = () => {
      map.getCanvas().style.cursor = ''
    }
    state = {
      data: data || EMPTY_POI_DATA,
      visible: true,
      markers: new Map(),
      activePopup: null,
      activePopupId: null,
      markerRefreshTimer: null,
      refreshMarkers,
      scheduleMarkerRefresh,
      sourceDataListener,
      clusterClickListener,
      clusterMouseEnterListener,
      clusterMouseLeaveListener,
      interactionsRegistered: false,
    }
    states.set(map, state)
    map.on('moveend', state.scheduleMarkerRefresh)
    map.on('sourcedata', state.sourceDataListener)
  } else if (data) {
    state.data = data
  }

  const source = map.getSource(POI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(state.data as any)
  else {
    map.addSource(POI_SOURCE_ID, {
      type: 'geojson',
      data: state.data as any,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 48,
    })
  }
  addClusterLayers(map)
  registerClusterInteractions(map, state)
  syncLayerVisibility(map, state.visible)
  state.scheduleMarkerRefresh()
}

export function setPoiLayerVisibility(map: maplibregl.Map, visible: boolean) {
  const state = states.get(map)
  if (!state) return
  state.visible = visible
  syncLayerVisibility(map, visible)
  if (visible) state.scheduleMarkerRefresh()
  else {
    if (state.markerRefreshTimer) clearTimeout(state.markerRefreshTimer)
    state.markerRefreshTimer = null
    clearMarkers(state)
  }
}

export function updatePoiData(map: maplibregl.Map, data: PoiFeatureCollection) {
  const state = states.get(map)
  if (!state) {
    addPoiLayers(map, data)
    return
  }
  state.data = data
  const source = map.getSource(POI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(data as any)
  state.scheduleMarkerRefresh()
}

export function removePoiLayers(map: maplibregl.Map) {
  const state = states.get(map)
  if (state) {
    if (state.markerRefreshTimer) clearTimeout(state.markerRefreshTimer)
    map.off('moveend', state.scheduleMarkerRefresh)
    map.off('sourcedata', state.sourceDataListener)
    if (state.interactionsRegistered) {
      map.off('click', POI_CLUSTER_LAYER_ID, state.clusterClickListener)
      map.off('mouseenter', POI_CLUSTER_LAYER_ID, state.clusterMouseEnterListener)
      map.off('mouseleave', POI_CLUSTER_LAYER_ID, state.clusterMouseLeaveListener)
    }
    clearMarkers(state)
    states.delete(map)
  }
  for (const layerId of [POI_CLUSTER_COUNT_LAYER_ID, POI_CLUSTER_LAYER_ID]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
  }
  if (map.getSource(POI_SOURCE_ID)) map.removeSource(POI_SOURCE_ID)
}
