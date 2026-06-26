export interface Plot {
  id: string
  cadastral_number: string
  address?: string
  area_m2?: number
  category?: string
  permitted_use?: string
  cadastral_value?: number
  cad_unit?: string
  price?: number
  price_per_hectare?: number
  status: 'free' | 'reserved' | 'booked' | 'sold'
  title?: string
  description?: string
  geometry?: any
  created_at: string
  updated_at: string
}

export interface PlotGeoJSON {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: any
    properties: Record<string, any>
  }>
}

export interface Settlement {
  id: string
  name: string
  description?: string
  region?: string
  district?: string
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

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  return res.json()
}

export const api = {
  plots: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<PlotListResponse>(`/plots${qs}`)
    },
    geo: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<PlotGeoJSON>(`/plots/geo${qs}`)
    },
    get: (id: string) => request<Plot>(`/plots/${id}`),
    create: (data: any) =>
      request<Plot>('/plots', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<Plot>(`/plots/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/plots/${id}`, { method: 'DELETE' }),
  },
  settlements: {
    list: () => request<Settlement[]>('/settlements'),
    get: (id: string) => request<Settlement>(`/settlements/${id}`),
  },
  search: {
    suggest: (q: string) =>
      request<{ results: SearchSuggestion[] }>(`/search/suggest?q=${encodeURIComponent(q)}&limit=10`),
  },
  auth: {
    login: (email: string, password: string) =>
      request<{ access_token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (data: { email: string; password: string; full_name?: string }) =>
      request<{ access_token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<any>('/auth/me'),
  },
  leads: {
    create: (data: { plot_id: string; buyer_name?: string; buyer_phone?: string; buyer_email?: string; message?: string }) =>
      request('/leads', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request<any[]>('/leads'),
  },
  imports: {
    upload: async (file: File, settlement_id?: string) => {
      const token = localStorage.getItem('token')
      const form = new FormData()
      form.append('file', file)
      if (settlement_id) form.append('settlement_id', settlement_id)
      const res = await fetch(`${API}/import/excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      return res.json()
    },
    list: () => request<any[]>('/import'),
  },
}
