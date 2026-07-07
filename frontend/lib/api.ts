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
  district?: string
  geometry?: Record<string, unknown>
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

export interface PlotListResponse {
  items: Plot[]
  total: number
  page: number
  page_size: number
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

export interface LeadResponse {
  id: string
  plot_id: string
  buyer_name?: string
  buyer_phone?: string
  buyer_email?: string
  message?: string
  status: string
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
  plots: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<PlotListResponse>(`/plots${qs}`)
    },
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
    bulkDelete: (ids: string[]) =>
      request<{ deleted: number }>('/plots/bulk', { method: 'DELETE', body: JSON.stringify(ids) }),
    enrich: (id: string) =>
      request<Plot>(`/plots/${id}/enrich`, { method: 'POST' }),
    batchEnrich: () =>
      request<{ enriched: number }>('/plots/batch-enrich', { method: 'POST' }),
    lookup: (cadastral_number: string) =>
      request<Record<string, unknown>>(`/plots/lookup?cadastral_number=${encodeURIComponent(cadastral_number)}`),
  },
  settlements: {
    list: () => request<Settlement[]>('/settlements'),
    get: (id: string) => request<Settlement>(`/settlements/${id}`),
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
    suggest: (q: string) =>
      request<{ results: SearchSuggestion[] }>(`/search/suggest?q=${encodeURIComponent(q)}&limit=10`),
  },
  auth: {
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (data: { email: string; password: string; full_name?: string }) =>
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
    create: (data: { plot_id: string; buyer_name?: string; buyer_phone?: string; buyer_email?: string; message?: string }) =>
      request<{ status: string; id: string }>('/leads', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request<LeadResponse[]>('/leads'),
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
