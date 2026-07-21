import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const adminLayout = new URL('../app/admin/AdminShell.tsx', import.meta.url)
const homePage = new URL('../app/page.tsx', import.meta.url)

test('admin side navigation can be hidden and pinned persistently', async () => {
  const source = await readFile(adminLayout, 'utf8')

  assert.match(source, /usePersistentBoolean\('landsearch:admin-sidebar-open', true\)/)
  assert.match(source, /usePersistentBoolean\('landsearch:admin-sidebar-pinned', true\)/)
  assert.match(source, /Скрыть боковое меню/)
  assert.match(source, /Открыть боковое меню/)
  assert.match(source, /Закрепить боковое меню/)
  assert.match(source, /aria-pressed=\{sidebarPinned\}/)
  assert.match(source, /md:sticky md:top-0 md:h-screen/)
})

test('public filter rail supports hide and pinned or overlay modes', async () => {
  const source = await readFile(homePage, 'utf8')

  assert.match(source, /usePersistentBoolean\('landsearch:filters-open', true\)/)
  assert.match(source, /usePersistentBoolean\('landsearch:filters-pinned', true\)/)
  assert.match(source, /Скрыть фильтры/)
  assert.match(source, /Открыть фильтры/)
  assert.match(source, /Открепить панель фильтров/)
  assert.match(source, /absolute inset-y-0 left-0 z-20 hidden md:flex shadow-xl/)
  assert.match(source, /safeGet\('landsearch:filters-open'\)/)
  assert.match(source, /if \(stored === 'true' \|\| stored === 'false'\) return/)
})
