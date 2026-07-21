import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('browser authentication uses HttpOnly cookies instead of localStorage bearer tokens', async () => {
  const [api, admin, auth] = await Promise.all([
    read('lib/api.ts'),
    read('app/admin/layout.tsx'),
    read('../backend/app/api/v1/auth.py'),
  ])

  assert.match(api, /credentials: 'include'/)
  assert.doesNotMatch(api, /safeGet\('token'\)|Authorization: `Bearer/)
  assert.doesNotMatch(admin, /safeGet\('token'\)|safeRemove\('token'\)/)
  assert.match(auth, /httponly=True/)
  assert.match(auth, /landsearch_refresh/)
  assert.match(auth, /SessionResponse/)
})

test('public and service pages publish SEO contracts', async () => {
  const [root, auth, admin, adminShell, plotLayout, settlementLayout, settlementPage] = await Promise.all([
    read('app/layout.tsx'),
    read('app/auth/layout.tsx'),
    read('app/admin/layout.tsx'),
    read('app/admin/AdminShell.tsx'),
    read('app/plots/[id]/layout.tsx'),
    read('app/settlements/[id]/layout.tsx'),
    read('app/settlements/[id]/page.tsx'),
  ])

  assert.match(root, /application\/ld\+json/)
  assert.match(root, /twitter:/)
  assert.match(auth, /index: false/)
  assert.match(admin, /index: false/)
  assert.match(adminShell, /useEffect/)
  assert.match(plotLayout, /generateMetadata/)
  assert.match(settlementLayout, /generateMetadata/)
  assert.match(settlementPage, /analysis\?\.settlement_name/)
})
