import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const apiClient = new URL('../lib/api.ts', import.meta.url)
const mapView = new URL('../components/MapView.tsx', import.meta.url)

test('POI viewport requests follow the visibility toggle without reinitializing the map', async () => {
  const source = await readFile(mapView, 'utf8')

  assert.match(source, /showSettlementPoisRef\.current\) return/)
  assert.match(source, /poiAbortControllerRef\.current\?\.abort\(\)/)
  assert.match(source, /poiFetchRef\.current\?\.\(resultBounds \|\| undefined\)/)
  assert.match(source, /poiFetchRef\.current = fetchPoiData/)
})

test('admin and public POI types keep settlement_name scoped to public features', async () => {
  const source = await readFile(apiClient, 'utf8')

  assert.match(source, /export interface SettlementPoi \{[\s\S]*?is_published: boolean\n\}/)
  assert.match(source, /export interface PublicPoiFeatureProperties \{[\s\S]*?settlement_name: string[\s\S]*?description\?: string \| null\n\}/)
  assert.match(source, /properties: PublicPoiFeatureProperties/)
  assert.match(source, /adminList: \(settlementId: string\) => request<SettlementPoi\[\]>/)
})
