import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

const settlementPage = new URL('../app/settlements/[id]/page.tsx', import.meta.url)
const homePage = new URL('../app/page.tsx', import.meta.url)
const loginPage = new URL('../app/auth/login/page.tsx', import.meta.url)
const mapViewComponent = new URL('../components/MapView.tsx', import.meta.url)
const layerSwitcherComponent = new URL('../components/LayerSwitcher.tsx', import.meta.url)
const plotCardListComponent = new URL('../components/PlotCardList.tsx', import.meta.url)
const searchBarComponent = new URL('../components/ui/SearchBar.tsx', import.meta.url)
const constantsModule = new URL('../lib/constants.ts', import.meta.url)
const mapTilesModule = new URL('../lib/map-tiles.ts', import.meta.url)
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

test('settlement analysis map reinitializes layers after base-layer switches', async () => {
  const source = await readFile(settlementPage, 'utf8')
  const styleSwitchIndex = source.indexOf('map.setStyle(style)')
  const styleSwitchBlock = source.slice(Math.max(0, styleSwitchIndex - 200), styleSwitchIndex + 500)

  assert.notEqual(styleSwitchIndex, -1)
  assert.match(styleSwitchBlock, /reinitGuard\.current = false/)
  assert.match(styleSwitchBlock, /map\.once\('style\.load', loadLayers\)/)
  assert.match(styleSwitchBlock, /setTimeout\(loadLayers, 500\)/)
})

test('map vector tiles use the configured API base without double-origin URLs', async () => {
  const mapView = await readFile(mapViewComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const mapTiles = await readFile(mapTilesModule, 'utf8')

  assert.match(mapView, /buildPlotTileUrl/)
  assert.match(layerSwitcher, /buildPlotTileUrl/)
  assert.match(mapTiles, /absoluteApiPath/)
  assert.doesNotMatch(mapView, /window\.location\.origin[^\\n]+API/)
  assert.doesNotMatch(layerSwitcher, /\/api\/v1\/plots\/tiles/)
})

test('base map layers do not rely on missing local tile proxy routes', async () => {
  const source = await readFile(constantsModule, 'utf8')
  const baseLayersIndex = source.indexOf('export const BASE_LAYERS')
  const baseLayersSource = source.slice(baseLayersIndex)

  assert.notEqual(baseLayersIndex, -1)
  assert.doesNotMatch(baseLayersSource, /tiles:\s*\[\s*['"]\/tiles\//)
  assert.match(baseLayersSource, /https:\/\/tile\.openstreetmap\.org/)
  assert.match(baseLayersSource, /https:\/\/server\.arcgisonline\.com/)
})

test('home land search filters are applied to map vector tile requests', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')

  assert.match(home, /<MapView[\s\S]*filters=\{filters\}/)
  assert.match(home, /<LayerSwitcher[\s\S]*filters=\{filters\}/)
  assert.match(mapView, /buildPlotTileUrl\(filters\)/)
  assert.match(layerSwitcher, /buildPlotTileUrl\(filters\)/)
  assert.match(mapView, /setTiles\(\[tileUrl\]\)/)
})

test('home search passes plot result bounds to MapView and displays API total', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const plotCards = await readFile(plotCardListComponent, 'utf8')

  assert.match(home, /getPlotBounds\(list\.items\)/)
  assert.match(home, /resultBounds=\{resultBounds\}/)
  assert.match(home, /total=\{plotsTotal\}/)
  assert.match(mapView, /resultBounds\?: maplibregl\.LngLatBoundsLike/)
  assert.match(mapView, /map\.fitBounds\(resultBounds/)
  assert.match(plotCards, /total: number/)
  assert.match(plotCards, /\{total\}/)
})

test('search selections use LandScanner-style geometry bounds for the map viewport', async () => {
  const home = await readFile(homePage, 'utf8')
  const searchBar = await readFile(searchBarComponent, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const plotCards = await readFile(plotCardListComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const bounds = await readFile(new URL('../lib/plot-bounds.ts', import.meta.url), 'utf8')

  assert.match(searchBar, /onSearch\(\{ query: s\.value, suggestion: s \}\)/)
  assert.match(home, /suggestion\?\.type === 'settlement'/)
  assert.match(home, /settlement_id: suggestion\.id/)
  assert.match(home, /api\.settlements\.get\(suggestion\.id\)/)
  assert.match(home, /api\.plots\.get\(suggestion\.id\)/)
  assert.match(home, /selectionRequestIdRef/)
  assert.match(home, /onChange=\{handleFiltersChange\}/)
  assert.doesNotMatch(home, /const results = await api\.search\.suggest/)
  assert.match(home, /setPlotsList\(\[\]\)/)
  assert.match(home, /setPlotsTotal\(0\)/)
  assert.match(home, /setListBounds\(null\)/)
  assert.match(bounds, /export function getGeometryBounds/)
  assert.match(bounds, /geometry\.type !== 'Polygon'/)
  assert.match(bounds, /geometry\.type !== 'MultiPolygon'/)
  assert.match(bounds, /Array\.isArray/)
  assert.doesNotMatch(bounds, /\.flat\(/)
  assert.doesNotMatch(bounds, /Math\.min\(\.\.\./)
  assert.match(mapView, /const compactViewport = map\.getContainer\(\)\.clientWidth < 768/)
  assert.match(layerSwitcher, /const tileUrlRef = useRef\(buildPlotTileUrl\(filters\)\)/)
  assert.match(layerSwitcher, /tiles: \[tileUrlRef\.current\]/)
  assert.match(plotCards, /Показано \{plots\.length\} из \{total\}/)
})

test('login form labels are associated with their inputs for mouse and keyboard users', async () => {
  const source = await readFile(loginPage, 'utf8')

  assert.match(source, /<label[^>]+htmlFor="email"/)
  assert.match(source, /<input[\s\S]*id="email"[\s\S]*type="email"/)
  assert.match(source, /<label[^>]+htmlFor="password"/)
  assert.match(source, /<input[\s\S]*id="password"[\s\S]*type="password"/)
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
