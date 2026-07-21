export interface Plot {
  id: string
  cadastral_number: string
  address?: string
  area_m2?: number
  category?: string
  permitted_use?: string
  cadastral_value?: number
  cad_unit?: string
  cad_status?: string
  object_type?: string
  land_plot_type?: string
  registration_date?: string
  ownership_form?: string
  price?: number
  price_per_hectare?: number
  status: 'free' | 'reserved' | 'booked' | 'sold'
  title?: string
  description?: string
  geometry?: Record<string, unknown>
  center_lng?: number
  center_lat?: number
  created_at: string
  updated_at: string
}

export interface PlotGeoJSON {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: Record<string, unknown>
    properties: Record<string, unknown>
  }>
}

export interface Settlement {
  id: string
  name: string
  description?: string
  region?: string
  address?: string
  district?: string
  geometry?: Record<string, unknown>
  boundary_source?: 'nspd' | 'manual_polygon' | 'manual_radius' | null
  boundary_radius_m?: number | null
  boundary_updated_at?: string | null
  public_slug?: string | null
  is_published?: boolean
  published_at?: string | null
  plots?: Plot[]
  stats?: {
    total_plots: number
    free_plots: number
    reserved_plots: number
    booked_plots: number
    sold_plots: number
    total_area_ha: number
    total_price: number
  avg_price_per_ha: number
  }
}

export interface PublicSettlement {
  id: string
  name: string
  description?: string
  address?: string
  region?: string
  district?: string
  geometry: Record<string, unknown>
  public_slug: string
  stats: {
    total_plots: number
    by_status: Record<Plot['status'], number>
    total_area_m2: number
    total_price: number
  }
}

export interface SettlementCreate {
  name: string
  description?: string
  address?: string
  region?: string
  district?: string
}

export interface SettlementDeleteResult {
  deleted: boolean
  settlement_id: string
  name: string
  unlinked_plots: number
}

export type SettlementBoundaryMode = 'polygon' | 'radius' | 'clear'

export interface SettlementBoundaryPayload {
  mode: SettlementBoundaryMode
  geometry?: Record<string, unknown> | null
  radius_m?: number | null
}

export interface SettlementBoundaryPreview {
  plot_count: number
  by_status: Record<Plot['status'], number>
  linked_plot_count?: number
  unlinked_plot_count?: number
}

export interface PlotListResponse {
  items: Plot[]
  total: number
  page: number
  page_size: number
}

export interface PlotStatsResponse {
  total: number
  by_status: Record<Plot['status'], number>
  total_area_m2: number
  total_area_ha: number
  total_price: number
  avg_price_per_m2?: number
  data_quality: {
    missing_geometry: number
    missing_price: number
    missing_area: number
    missing_category: number
  }
}

export interface SearchSuggestion {
  type: 'plot' | 'settlement'
  id: string
  label: string
  value: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: {
    id: string
    email: string
    full_name?: string
    role: string
    is_active: boolean
  }
}

export interface LegalProfile {
  operator_name?: string | null
  legal_form?: string | null
  inn?: string | null
  ogrn?: string | null
  address?: string | null
  email?: string | null
  phone?: string | null
  rkn_registry_number?: string | null
  rkn_registry_url?: string | null
  rkn_exemption_reason?: string | null
  policy_effective_date?: string | null
  lead_retention_days: number
  reservation_retention_days: number
  is_complete: boolean
  updated_at?: string | null
}

export type LeadStatus = 'new' | 'in_progress' | 'closed' | 'spam'

export interface LeadResponse {
  id: string
  plot_id: string
  buyer_name?: string
  buyer_phone?: string
  buyer_email?: string
  message?: string
  status: LeadStatus
  plot_title?: string
  plot_cadastral_number?: string
  plot_status?: Plot['status']
  plot_price?: number
  consent_at?: string
  consent_version?: string
  expires_at?: string
  created_at: string
}

export type ReservationStatus = 'active' | 'confirmed' | 'cancelled' | 'expired'

export interface ReservationResponse {
  id: string
  plot_id: string
  lead_id?: string
  responsible_user_id: string
  buyer_name?: string
  buyer_phone?: string
  buyer_email?: string
  note?: string
  status: ReservationStatus
  starts_at: string
  expires_at: string
  confirmed_at?: string
  cancelled_at?: string
  created_at: string
  updated_at: string
  plot_cadastral_number?: string
  plot_title?: string
  plot_status?: Plot['status']
}

export interface AuditEventResponse {
  id: string
  actor_id?: string
  entity_type: string
  entity_id: string
  action: string
  details: Record<string, unknown>
  created_at: string
}

export interface WebhookConfigResponse {
  url?: string
  enabled: boolean
  has_secret: boolean
  updated_at?: string
}

export interface WebhookDeliveryResponse {
  id: string
  event_id: string
  event_type: string
  status: string
  attempts: number
  next_attempt_at: string
  last_http_status?: number
  last_error_code?: string
  delivered_at?: string
  created_at: string
}

export interface ImportResponse {
  id: string
  source: string
  status: string
  total_rows: number
  success_rows: number
  error?: string
  created_at: string
}

export interface UserResponse {
  id: string
  email: string
  full_name?: string
  role: string
  is_active: boolean
}

export type PoiType = 'shop' | 'playground' | 'sports' | 'checkpoint' | 'entrance' | 'exit' | 'parking' | 'school' | 'kindergarten' | 'cafe' | 'medical' | 'sales_office' | 'other'

export interface SettlementPoi {
  id: string
  settlement_id: string
  poi_type: PoiType
  custom_type_label?: string | null
  name: string
  description?: string | null
  longitude: number
  latitude: number
  is_published: boolean
}

export interface PublicPoiFeatureProperties {
  id: string
  settlement_id: string
  settlement_name: string
  poi_type: PoiType
  custom_type_label?: string | null
  name: string
  description?: string | null
}

export interface SettlementPoiInput {
  settlement_id: string
  poi_type: PoiType
  custom_type_label?: string | null
  name: string
  description?: string | null
  longitude: number
  latitude: number
  is_published?: boolean
}

export interface PoiFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: PublicPoiFeatureProperties
  }>
}

import { safeGet } from './storage'


class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? safeGet('token') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    let message: string
    try {
      const err = await res.json()
      message = err.detail || err.message || res.statusText
    } catch {
      message = res.statusText || `Request failed (${res.status})`
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface SettlementAnalysis {
  settlement_id: string
  settlement_name: string
  total_area_m2: number
  total_area_ha: number
  occupied_area_m2: number
  occupied_area_ha: number
  occupied_percent: number
  free_area_m2: number
  free_area_ha: number
  free_percent: number
  free_zones_count: number
  total_plots: number
  occupied_plots_count: number
  free_plots_count: number
  free_zones: Array<{ zone_index: number; area_m2: number; area_ha: number; centroid: [number, number] }>
  vri_summary: Record<string, number>
  category_summary: Record<string, number>
  status_summary: Record<string, number>
  total_price: number
  total_price_per_ha: number
}

export interface ZoningLayerInfo {
  territorial_zone: { layer_id: number; category_id: number; title: string }
  functional_zone: { layer_id: number; category_id: number; title: string }
  cadastral_quarter: { layer_id: number; title: string }
  zone_classes: Record<string, { title: string; color: string }>
}

export interface RestrictionLayersInfo {
  groups: Record<string, Array<{ id: string; layer_id: number; category_id: number; title: string; color: string; group: string }>>
}

export const api = {
  pois: {
    geo: ({ bbox, types, signal }: { bbox: string; types?: string; signal?: AbortSignal }) =>
      request<PoiFeatureCollection>('/pois?' + new URLSearchParams({ bbox, ...(types ? { types } : {}) }).toString(), { signal }),
    adminList: (settlementId: string) => request<SettlementPoi[]>('/pois/admin?settlement_id=' + encodeURIComponent(settlementId)),
    create: (data: SettlementPoiInput) => request<SettlementPoi>('/pois', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SettlementPoiInput>) => request<SettlementPoi>('/pois/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>('/pois/' + encodeURIComponent(id), { method: 'DELETE' }),
  },
  plots: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<PlotListResponse>(`/plots${qs}`)
    },
    stats: () => request<PlotStatsResponse>('/plots/stats'),
    geo: (params?: { bbox?: string; settlement_id?: string; status?: string; permitted_use?: string; cad_unit?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
      return request<PlotGeoJSON>(`/plots/geo${qs}`)
    },
    get: (id: string) => request<Plot>(`/plots/${id}`),
    create: (data: Partial<Plot>) =>
      request<Plot>('/plots', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Plot>) =>
      request<Plot>(`/plots/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/plots/${id}`, { method: 'DELETE' }),
    bulkDelete: (ids: string[], options?: { all_plots?: boolean; query?: string; filter_status?: Plot["status"] }) =>
      request<{ deleted: number }>('/plots/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ plot_ids: ids.length ? ids : undefined, ...options }),
      }),
    bulkUpdateStatus: (ids: string[], status: Plot['status'], options?: { all_plots?: boolean; query?: string; filter_status?: Plot['status'] }) =>
      request<{ updated: number; status: Plot['status'] }>('/plots/bulk/status', {
        method: 'PATCH',
        body: JSON.stringify({ plot_ids: ids.length ? ids : undefined, status, ...options }),
      }),
    enrich: (id: string) =>
      request<Plot>(`/plots/${id}/enrich`, { method: 'POST' }),
    batchEnrich: () =>
      request<{ enriched: number }>('/plots/batch-enrich', { method: 'POST' }),
    lookup: (cadastral_number: string) =>
      request<Record<string, unknown>>(`/plots/lookup?cadastral_number=${encodeURIComponent(cadastral_number)}`),
  },
  settlements: {
    list: () => request<Settlement[]>('/settlements'),
    bulkCreate: (items: SettlementCreate[]) =>
      request<{ created: number; skipped: number; items: Settlement[] }>('/settlements/bulk', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    create: (data: SettlementCreate) =>
      request<Settlement>('/settlements', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string, options?: { include_plots?: boolean }) => {
      const qs = options?.include_plots === false ? '?include_plots=false' : ''
      return request<Settlement>(`/settlements/${id}${qs}`)
    },
    delete: (id: string) =>
      request<SettlementDeleteResult>(`/settlements/${id}`, { method: 'DELETE' }),
    previewBoundary: (id: string, data: SettlementBoundaryPayload) =>
      request<SettlementBoundaryPreview>(`/settlements/${id}/boundary/preview`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateBoundary: (id: string, data: SettlementBoundaryPayload) =>
      request<Settlement & SettlementBoundaryPreview>(`/settlements/${id}/boundary`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    importNspdPlots: (id: string) =>
      request<{ found: number; imported: number; updated: number; skipped: number; excluded: number; unlinked: number }>('/settlements/' + id + '/nspd-import', {
        method: 'POST',
      }),
    updatePublication: (id: string, data: { is_published: boolean; public_slug?: string }) =>
      request<{ id: string; public_slug?: string; is_published: boolean; published_at?: string }>(`/settlements/${id}/publication`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getPublic: (slug: string) => request<PublicSettlement>(`/settlements/public/${encodeURIComponent(slug)}`),
    analyze: (id: string, minArea?: number, maxArea?: number) => {
      const params = new URLSearchParams()
      if (minArea) params.set('min_area', String(minArea))
      if (maxArea) params.set('max_area', String(maxArea))
      const qs = params.toString() ? '?' + params.toString() : ''
      return request<SettlementAnalysis>(`/settlements/${id}/analysis${qs}`)
    },
  },
  layers: {
    zoning: () => request<ZoningLayerInfo>('/layers/zoning'),
    restrictions: () => request<RestrictionLayersInfo>('/layers/restrictions'),
  },
  search: {
    suggest: (q: string, signal?: AbortSignal) =>
      request<{ results: SearchSuggestion[] }>(`/search/suggest?q=${encodeURIComponent(q)}&limit=10`, { signal }),
  },
  auth: {
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (data: { email: string; password: string; full_name?: string; terms_accepted: boolean; terms_version?: string }) =>
      request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<UserResponse>('/auth/me'),
    refresh: (refresh_token: string) =>
      request<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token }),
      }),
  },
  leads: {
    create: (data: { plot_id: string; buyer_name?: string; buyer_phone?: string; buyer_email?: string; message?: string; consent_given: true; consent_version?: string }) =>
      request<{ status: string; id: string }>('/leads', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request<LeadResponse[]>('/leads'),
    update: (id: string, data: { status: LeadStatus }) =>
      request<LeadResponse>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/leads/${id}`, { method: 'DELETE' }),
  },
  reservations: {
    list: (status?: ReservationStatus) =>
      request<ReservationResponse[]>(`/reservations${status ? `?status=${status}` : ''}`),
    create: (data: { plot_id: string; lead_id?: string; buyer_name?: string; buyer_phone?: string; buyer_email?: string; note?: string; duration_hours?: number }) =>
      request<ReservationResponse>('/reservations', { method: 'POST', body: JSON.stringify(data) }),
    extend: (id: string, duration_hours = 24) =>
      request<ReservationResponse>(`/reservations/${id}/extend`, { method: 'PATCH', body: JSON.stringify({ duration_hours }) }),
    confirm: (id: string) => request<ReservationResponse>(`/reservations/${id}/confirm`, { method: 'PATCH' }),
    cancel: (id: string) => request<ReservationResponse>(`/reservations/${id}/cancel`, { method: 'PATCH' }),
    expire: () => request<{ expired: number }>('/reservations/expire', { method: 'POST' }),
  },
  audit: {
    list: (entityType?: string) =>
      request<AuditEventResponse[]>(`/audit${entityType ? `?entity_type=${encodeURIComponent(entityType)}` : ''}`),
  },
  webhook: {
    get: () => request<WebhookConfigResponse>('/settings/webhook'),
    update: (data: { url: string; secret?: string; enabled: boolean }) =>
      request<WebhookConfigResponse>('/settings/webhook', { method: 'PUT', body: JSON.stringify(data) }),
    deliveries: () => request<WebhookDeliveryResponse[]>('/settings/webhook/deliveries'),
    process: () => request<{ processed: number }>('/settings/webhook/deliveries/process', { method: 'POST' }),
    retry: (id: string) => request<{ status: string }>(`/settings/webhook/deliveries/${id}/retry`, { method: 'POST' }),
  },
  legal: {
    public: () => request<LegalProfile>('/legal'),
    get: () => request<LegalProfile>('/settings/legal'),
    update: (data: Omit<LegalProfile, 'is_complete' | 'updated_at'>) =>
      request<LegalProfile>('/settings/legal', { method: 'PUT', body: JSON.stringify(data) }),
  },
  imports: {
    upload: async (file: File, settlement_id?: string) => {
      const token = safeGet('token')
      const form = new FormData()
      form.append('file', file)
      if (settlement_id) form.append('settlement_id', settlement_id)
      const res = await fetch(`${API}/import/excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const err = await res.text()
        throw new ApiError(err || res.statusText, res.status)
      }
      return res.json() as Promise<ImportResponse>
    },
    list: () => request<ImportResponse[]>('/import'),
  },
}
