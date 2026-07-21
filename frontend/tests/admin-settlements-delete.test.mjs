import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pageFile = new URL('../app/admin/settlements/page.tsx', import.meta.url)
const apiFile = new URL('../lib/api.ts', import.meta.url)

test('admin settlements page exposes a confirmed delete flow', async () => {
  const page = await readFile(pageFile, 'utf8')

  assert.match(page, /Удалить поселок/)
  assert.match(page, /window\.confirm\(/)
  assert.match(page, /api\.settlements\.delete\((selected\.id|selectedSettlement\.id)\)/)
  assert.match(page, /setSettlements\(\(items\) => items\.filter\(\(item\) => item\.id !== (selected\.id|selectedIdToDelete)\)\)/)
  assert.match(page, /setSelected\(null\)/)
  assert.match(page, /setSelectedId\(''\)/)
})

test('settlement delete API keeps the admin endpoint contract', async () => {
  const api = await readFile(apiFile, 'utf8')

  assert.match(api, /delete: \(id: string\) =>\s*request<SettlementDeleteResult>\(`\/settlements\/\$\{id\}`, \{ method: 'DELETE' \}\)/)
})
