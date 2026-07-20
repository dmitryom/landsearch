import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dataTableComponent = new URL('../components/ui/DataTable.tsx', import.meta.url)
const adminPlotsPage = new URL('../app/admin/plots/page.tsx', import.meta.url)

test('admin plots table supports persisted column order and visibility preferences', async () => {
  const dataTable = await readFile(dataTableComponent, 'utf8')
  const plotsPage = await readFile(adminPlotsPage, 'utf8')

  assert.match(dataTable, /columnPreferencesKey\?: string/)
  assert.match(dataTable, /columnOrder/)
  assert.match(dataTable, /onColumnOrderChange: setColumnOrder/)
  assert.match(dataTable, /safeGet\(columnPreferencesKey\)/)
  assert.match(dataTable, /safeSet\(columnPreferencesKey/)
  assert.match(dataTable, /Сбросить порядок и видимость/)
  assert.match(dataTable, /event\.key === 'Escape'/)
  assert.match(plotsPage, /columnPreferencesKey="landsearch:admin-plots:columns"/)
})

test('table headers expose native drag and drop affordance for reordering', async () => {
  const dataTable = await readFile(dataTableComponent, 'utf8')

  assert.match(dataTable, /draggable/)
  assert.match(dataTable, /onDragStart=/)
  assert.match(dataTable, /onDragOver=/)
  assert.match(dataTable, /onDrop=/)
  assert.match(dataTable, /moveColumn\(sourceId, header\.column\.id\)/)
  assert.match(dataTable, /GripVertical/)
})
