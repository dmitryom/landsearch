import { absoluteApiPath } from './api-url'

export const TATARSTAN_REGION = 'Республика Татарстан'
export const TATARSTAN_BOUNDS: [[number, number], [number, number]] = [[46.5, 53.5], [55.9, 56.7]]
export const NSPD_CADASTRAL_LAYER_IDS = [36048, 36049, 36328, 36329] as const

const TILE_FILTER_KEYS = ['query', 'status', 'permitted_use', 'category', 'cad_unit', 'settlement_id', 'settlements_only', 'region'] as const

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

export function buildNspdCadastreTileUrl(layerId: number): string {
  return absoluteApiPath(`/plots/tiles/nspd/${layerId}/{z}/{x}/{y}.png`)
}
