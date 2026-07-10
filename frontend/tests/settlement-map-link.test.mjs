import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

const settlementPage = new URL('../app/settlements/[id]/page.tsx', import.meta.url)
const nginxMapLocation = new URL('../../deploy/nginx/corner-bright-landscanner-map.conf', import.meta.url)
const publishScript = fileURLToPath(new URL('../../scripts/publish-landscanner-map.sh', import.meta.url))
const frontendDirectory = fileURLToPath(new URL('../', import.meta.url))
const execFile = promisify(execFileCallback)

test('Corner Bright settlement page exposes the generated map command', async () => {
  const source = await readFile(settlementPage, 'utf8')

  assert.match(source, /eafe5fc4-165f-421e-aa79-3ae786458627/)
  assert.match(source, /Карта посёлка/)
  assert.match(source, /\/settlements\/\$\{id\}\/map/)
})

test('Nginx publishes only the reviewed Corner Bright artifact', async () => {
  const source = await readFile(nginxMapLocation, 'utf8')

  assert.match(source, /location = \/settlements\/eafe5fc4-165f-421e-aa79-3ae786458627\/map/)
  assert.match(source, /alias \/var\/www\/landsearch\/settlement-maps\/corner-bright\/full_map\.html/)
  assert.match(source, /location \/settlement-map-assets\//)
  assert.match(source, /location \/settlement-map-glyphs\//)
  assert.match(source, /location \/tiles\/carto\/labels\//)
  assert.match(source, /script-src 'self' 'unsafe-inline'/)
  assert.doesNotMatch(source, /unpkg\.com/)
})

test('artifact publisher self-hosts LandScanner map dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'corner-bright-map-'))
  const input = join(directory, 'source.html')
  const output = join(directory, 'published', 'full_map.html')
  await writeFile(input, `
    <link href="https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.css" rel="stylesheet" />
    <script src="https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.js"></script>
    <script>
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
      imagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      labels: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'
    </script>
  `, 'utf8')

  await execFile(publishScript, [input, output], { env: { ...process.env, LANDSEARCH_FRONTEND_DIR: frontendDirectory } })
  const published = await readFile(output, 'utf8')

  assert.match(published, /\/settlement-map-assets\/maplibre-gl\.css/)
  assert.match(published, /\/settlement-map-assets\/maplibre-gl\.js/)
  assert.match(published, /\/settlement-map-glyphs\/\{fontstack\}\/\{range\}\.pbf/)
  assert.match(published, /\/tiles\/esri\/imagery\/\{z\}\/\{y\}\/\{x\}/)
  assert.match(published, /\/tiles\/carto\/labels\/\{z\}\/\{x\}\/\{y\}\.png/)
  assert.doesNotMatch(published, /https:\/\/(unpkg\.com|demotiles\.maplibre\.org|server\.arcgisonline\.com|a\.basemaps\.cartocdn\.com)/)
  await stat(join(directory, 'published', 'assets', 'maplibre-gl.js'))
  await stat(join(directory, 'published', 'assets', 'maplibre-gl.css'))
})
