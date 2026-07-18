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
}

type PoiLayerState = {
  data: PoiFeatureCollection
  visible: boolean
  markers: Map<string, PoiMarker>
  refreshMarkers: () => void
  sourceDataListener: () => void
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

function removeMarker(marker: PoiMarker) {
  marker.element.removeEventListener('click', marker.onClick)
  marker.root.unmount()
  marker.marker.remove()
}

function clearMarkers(state: PoiLayerState) {
  for (const marker of state.markers.values()) removeMarker(marker)
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

function createPoiMarker(map: maplibregl.Map, feature: maplibregl.MapGeoJSONFeature): PoiMarker | null {
  if (feature.geometry.type !== 'Point') return null
  const coordinates = feature.geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null

  const properties = (feature.properties || {}) as Record<string, unknown>
  const poiType = isPoiType(properties.poi_type) ? properties.poi_type : 'other'
  const Icon = POI_ICONS[poiType]
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2'
  element.setAttribute('aria-label', poiLabel(properties))
  const root = createRoot(element)
  root.render(<Icon size={16} color="white" strokeWidth={2.5} />)
  element.style.backgroundColor = POI_COLORS[poiType]

  const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
    .setLngLat([Number(coordinates[0]), Number(coordinates[1])])
    .addTo(map)
  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    new maplibregl.Popup({ offset: 18, closeButton: true })
      .setLngLat([Number(coordinates[0]), Number(coordinates[1])])
      .setDOMContent(popupContent(properties))
      .addTo(map)
  }
  element.addEventListener('click', onClick)
  return { marker, root, element, onClick }
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

export function addPoiLayers(map: maplibregl.Map, data?: PoiFeatureCollection) {
  let state = states.get(map)
  if (!state) {
    const refreshMarkers = () => {
      const current = states.get(map)
      if (!current) return
      clearMarkers(current)
      if (!current.visible || !map.getSource(POI_SOURCE_ID)) return
      for (const feature of map.querySourceFeatures(POI_SOURCE_ID, { filter: ['!', ['has', 'point_count']] })) {
        const properties = (feature.properties || {}) as Record<string, unknown>
        const id = typeof properties.id === 'string' ? properties.id : ''
        const marker = createPoiMarker(map, feature)
        if (id && marker) current.markers.set(id, marker)
        else if (marker) removeMarker(marker)
      }
    }
    state = {
      data: data || EMPTY_POI_DATA,
      visible: true,
      markers: new Map(),
      refreshMarkers,
      sourceDataListener: refreshMarkers,
    }
    states.set(map, state)
    map.on('moveend', state.refreshMarkers)
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
  syncLayerVisibility(map, state.visible)
  window.setTimeout(state.refreshMarkers, 0)
}

export function setPoiLayerVisibility(map: maplibregl.Map, visible: boolean) {
  const state = states.get(map)
  if (!state) return
  state.visible = visible
  syncLayerVisibility(map, visible)
  state.refreshMarkers()
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
  window.setTimeout(state.refreshMarkers, 0)
}

export function removePoiLayers(map: maplibregl.Map) {
  const state = states.get(map)
  if (state) {
    map.off('moveend', state.refreshMarkers)
    map.off('sourcedata', state.sourceDataListener)
    clearMarkers(state)
    states.delete(map)
  }
  for (const layerId of [POI_CLUSTER_COUNT_LAYER_ID, POI_CLUSTER_LAYER_ID]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
  }
  if (map.getSource(POI_SOURCE_ID)) map.removeSource(POI_SOURCE_ID)
}
