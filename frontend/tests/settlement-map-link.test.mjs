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
const plotDetailPage = new URL('../app/plots/[id]/page.tsx', import.meta.url)
const loginPage = new URL('../app/auth/login/page.tsx', import.meta.url)
const adminLayout = new URL('../app/admin/layout.tsx', import.meta.url)
const adminDashboardPage = new URL('../app/admin/page.tsx', import.meta.url)
const adminLeadsPage = new URL('../app/admin/leads/page.tsx', import.meta.url)
const mapViewComponent = new URL('../components/MapView.tsx', import.meta.url)
const layerSwitcherComponent = new URL('../components/LayerSwitcher.tsx', import.meta.url)
const plotCardListComponent = new URL('../components/PlotCardList.tsx', import.meta.url)
const leadFormComponent = new URL('../components/ui/LeadForm.tsx', import.meta.url)
const logPanelComponent = new URL('../components/ui/LogPanel.tsx', import.meta.url)
const searchBarComponent = new URL('../components/ui/SearchBar.tsx', import.meta.url)
const plotMapLayersModule = new URL('../lib/plot-map-layers.ts', import.meta.url)
const apiClient = new URL('../lib/api.ts', import.meta.url)
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

test('base map layers expose only Web Mercator-compatible imagery under cadastral boundaries', async () => {
  const source = await readFile(constantsModule, 'utf8')
  const baseLayersIndex = source.indexOf('export const BASE_LAYERS')
  const baseLayersSource = source.slice(baseLayersIndex)

  assert.notEqual(baseLayersIndex, -1)
  assert.match(baseLayersSource, /id: 'satellite'/)
  assert.match(baseLayersSource, /https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/)
  assert.doesNotMatch(baseLayersSource, /core-sat\.maps\.yandex\.net/)
  assert.doesNotMatch(baseLayersSource, /core-renderer-tiles\.maps\.yandex\.net/)
  assert.doesNotMatch(baseLayersSource, /id: 'yandex_sat'/)
  assert.doesNotMatch(baseLayersSource, /id: 'yandex_map'/)
})

test('home land search filters are applied to map vector tile requests', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const plotLayers = await readFile(plotMapLayersModule, 'utf8')
  const mapTiles = await readFile(mapTilesModule, 'utf8')

  assert.match(home, /<MapView[\s\S]*filters=\{filters\}/)
  assert.match(home, /<LayerSwitcher[\s\S]*filters=\{filters\}/)
  assert.match(mapView, /buildPlotTileUrl\(filters\)/)
  assert.match(layerSwitcher, /buildPlotTileUrl\(filters\)/)
  assert.match(mapView, /updatePlotTileUrl\(map, tileUrl\)/)
  assert.match(plotLayers, /source\.setTiles\(\[tileUrl\]\)/)
  assert.match(mapTiles, /'category'/)
})

test('home plot boundaries use the LandScanner parcel layer style', async () => {
  const mapView = await readFile(mapViewComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const plotLayers = await readFile(plotMapLayersModule, 'utf8')

  assert.match(mapView, /addPlotTileLayers\(map, tileUrlRef\.current\)/)
  assert.match(layerSwitcher, /addPlotTileLayers\(map, tileUrlRef\.current\)/)
  assert.match(plotLayers, /id: 'plots-fill'/)
  assert.match(plotLayers, /'fill-opacity': 0\.42/)
  assert.match(plotLayers, /id: 'plots-border'/)
  assert.match(plotLayers, /'line-join': 'round'/)
  assert.match(plotLayers, /'line-cap': 'round'/)
  assert.match(plotLayers, /'line-width': 1\.8/)
  assert.match(plotLayers, /'line-opacity': 0\.95/)
  assert.match(plotLayers, /id: 'plots-points'/)
  assert.match(plotLayers, /minzoom: 16/)
  assert.match(plotLayers, /'circle-radius': 4/)
  assert.match(plotLayers, /'circle-stroke-color': '#ffffff'/)
  assert.match(plotLayers, /'circle-stroke-width': 1\.2/)
  assert.match(plotLayers, /'circle-opacity': 0\.75/)
  assert.doesNotMatch(mapView, /'fill-opacity': 0\.18/)
  assert.doesNotMatch(layerSwitcher, /'fill-opacity': 0\.18/)
})

test('home map does not show cancelled vector tile loads as user-facing errors', async () => {
  const mapView = await readFile(mapViewComponent, 'utf8')

  assert.match(mapView, /function isAbortError\(error: unknown\): boolean/)
  assert.match(mapView, /message === 'AbortError'/)
  assert.match(mapView, /if \(isAbortError\(e\.error\)\) return/)
  assert.match(mapView, /log\('error', 'MapLibre error'/)
})

test('diagnostic logs panel is gated behind explicit debug flag', async () => {
  const logPanel = await readFile(logPanelComponent, 'utf8')

  assert.match(logPanel, /NEXT_PUBLIC_DEBUG_LOGS/)
  assert.match(logPanel, /if \(!debugLogs\) return null/)
})

test('plot detail uses a real lead form instead of prompt or tel handoff', async () => {
  const detail = await readFile(plotDetailPage, 'utf8')
  const leadForm = await readFile(leadFormComponent, 'utf8')

  assert.match(detail, /<LeadForm[\s\S]*plotId=\{plot\.id\}/)
  assert.doesNotMatch(detail, /prompt\(/)
  assert.doesNotMatch(detail, /tel:/)
  assert.match(leadForm, /api\.leads\.create/)
  assert.match(leadForm, /buyer_phone/)
  assert.match(leadForm, /buyer_email/)
})

test('plot detail map restores the selected plot layer after base-layer switches', async () => {
  const detail = await readFile(plotDetailPage, 'utf8')
  const styleSwitchIndex = detail.indexOf('map.setStyle(layer.style)')
  const styleSwitchBlock = detail.slice(Math.max(0, styleSwitchIndex - 500), styleSwitchIndex + 700)

  assert.match(detail, /detailMapContainerRef/)
  assert.match(detail, /addDetailPlotLayer\(map, plot/)
  assert.match(detail, /setData\(\{[\s\S]*type: 'FeatureCollection'/)
  assert.doesNotMatch(detail, /id="detail-map" className="absolute inset-0"/)
  assert.notEqual(styleSwitchIndex, -1)
  assert.match(styleSwitchBlock, /map\.once\('style\.load', reinit\)/)
  assert.match(styleSwitchBlock, /setTimeout\(reinit, 500\)/)
})

test('admin leads page lists leads and updates lifecycle status', async () => {
  const layout = await readFile(adminLayout, 'utf8')
  const leads = await readFile(adminLeadsPage, 'utf8')
  const api = await readFile(apiClient, 'utf8')

  assert.match(layout, /\/admin\/leads/)
  assert.match(leads, /api\.leads\.list\(\)/)
  assert.match(leads, /api\.leads\.update\(leadId/)
  assert.match(leads, /plot_cadastral_number/)
  assert.match(api, /export type LeadStatus = 'new' \| 'in_progress' \| 'closed' \| 'spam'/)
  assert.match(api, /update: \(id: string, data: \{ status: LeadStatus \}\)/)
})

test('admin dashboard uses tenant-wide stats endpoint instead of first page totals', async () => {
  const dashboard = await readFile(adminDashboardPage, 'utf8')
  const api = await readFile(apiClient, 'utf8')

  assert.match(api, /stats: \(\) => request<PlotStatsResponse>\('\/plots\/stats'\)/)
  assert.match(dashboard, /api\.plots\.stats\(\)/)
  assert.match(dashboard, /data_quality/)
  assert.doesNotMatch(dashboard, /page_size:\s*'200'/)
})

test('plot cards support saved favorites, comparison drawer and CSV export', async () => {
  const plotCards = await readFile(plotCardListComponent, 'utf8')

  assert.match(plotCards, /landsearch:favorites/)
  assert.match(plotCards, /landsearch:compare/)
  assert.match(plotCards, /safeGet/)
  assert.match(plotCards, /safeSet/)
  assert.match(plotCards, /Star/)
  assert.match(plotCards, /Scale/)
  assert.match(plotCards, /Развернуть список участков/)
  assert.match(plotCards, /comparePlots/)
  assert.match(plotCards, /downloadCompareCsv/)
})

test('home filters keep URL state and expose result sorting controls', async () => {
  const home = await readFile(homePage, 'utf8')
  const filterPanel = await readFile(new URL('../components/ui/FilterPanel.tsx', import.meta.url), 'utf8')

  assert.match(home, /filtersReady/)
  assert.match(home, /window\.history\.replaceState/)
  assert.match(home, /new URLSearchParams\(window\.location\.search\)/)
  assert.match(filterPanel, /sort_by/)
  assert.match(filterPanel, /sort_order/)
  assert.match(filterPanel, /created_at/)
  assert.match(filterPanel, /area_m2/)
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
  assert.match(searchBar, /suppressSuggestionQueryRef/)
  assert.match(searchBar, /requestId !== suggestRequestRef\.current/)
  assert.match(searchBar, /setSuggestions\(\[\]\)[\s\S]*onSearch\(\{ query: s\.value, suggestion: s \}\)/)
  assert.match(mapView, /const compactViewport = map\.getContainer\(\)\.clientWidth < 768/)
  assert.match(mapView, /getFitBoundsMaxZoom\(resultBounds\)/)
  assert.match(mapView, /longitudeSpan < 0\.01 && latitudeSpan < 0\.01 \? 17 : 15/)
  assert.match(layerSwitcher, /const tileUrlRef = useRef\(buildPlotTileUrl\(filters\)\)/)
  assert.match(layerSwitcher, /addPlotTileLayers\(map, tileUrlRef\.current\)/)
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
