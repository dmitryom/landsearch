import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('audit merge exposes operator settings and public legal pages', async () => {
  const [settings, api, operator, privacy, terms, robots, sitemap] = await Promise.all([
    read('app/admin/settings/page.tsx'),
    read('lib/api.ts'),
    read('app/operator/page.tsx'),
    read('app/privacy/page.tsx'),
    read('app/terms/page.tsx'),
    read('app/robots.ts'),
    read('app/sitemap.ts'),
  ])

  assert.match(settings, /Оператор и политика ПДн/)
  assert.match(settings, /Сохранить реквизиты/)
  assert.match(settings, /Номер в реестре Роскомнадзора/)
  assert.match(api, /'\/settings\/legal'/)
  assert.match(api, /'\/legal'/)
  assert.match(operator, /Оператор персональных данных/)
  assert.match(privacy, /Политика обработки персональных данных/)
  assert.match(terms, /Пользовательское соглашение/)
  assert.match(robots, /\/admin\//)
  assert.match(sitemap, /'\/operator'/)
})
