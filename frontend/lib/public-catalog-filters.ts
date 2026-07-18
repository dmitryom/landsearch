export function getPublicCatalogFilters(filters: Record<string, string>) {
  if (filters.settlement_id || filters.query?.trim()) return filters
  return { ...filters, settlements_only: 'true' }
}
