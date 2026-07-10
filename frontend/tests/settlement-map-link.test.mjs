import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const settlementPage = new URL('../app/settlements/[id]/page.tsx', import.meta.url)
const nginxMapLocation = new URL('../../deploy/nginx/corner-bright-landscanner-map.conf', import.meta.url)

test('Corner Bright settlement page exposes the generated map command', async () => {
  const source = await readFile(settlementPage, 'utf8')

  assert.match(source, /eafe5fc4-165f-421e-aa79-3ae786458627/)
  assert.match(source, /Карта посёлка/)
  assert.match(source, /\/settlements\/\$\{id\}\/map/)
})

test('Nginx publishes only the reviewed Corner Bright artifact', async () => {
  const source = await readFile(nginxMapLocation, 'utf8')

  assert.match(source, /location = \/settlements\/eafe5fc4-165f-421e-aa79-3ae786458627\/map/)
  assert.match(source, /alias \/var\/lib\/landscanner\/artifacts\/corner-bright\/full_map\.html/)
  assert.match(source, /demotiles\.maplibre\.org/)
})
