import { absoluteApiPath } from './api-url'

const TILE_FILTER_KEYS = ['query', 'status', 'permitted_use', 'category', 'cad_unit', 'settlement_id'] as const

export function buildPlotTileUrl(filters: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  for (const key of TILE_FILTER_KEYS) {
    const value = filters[key]?.trim()
    if (value) params.set(key, value)
  }

  const query = params.toString()
  const path = `/plots/tiles/{z}/{x}/{y}.mvt${query ? `?${query}` : ''}`
  return absoluteApiPath(path)
}
