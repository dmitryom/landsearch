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
const standaloneMapPage = new URL('../app/map/page.tsx', import.meta.url)
const plotDetailPage = new URL('../app/plots/[id]/page.tsx', import.meta.url)
const loginPage = new URL('../app/auth/login/page.tsx', import.meta.url)
const adminLayout = new URL('../app/admin/layout.tsx', import.meta.url)
const adminDashboardPage = new URL('../app/admin/page.tsx', import.meta.url)
const adminLeadsPage = new URL('../app/admin/leads/page.tsx', import.meta.url)
const adminPlotsPage = new URL('../app/admin/plots/page.tsx', import.meta.url)
const adminSettlementsPage = new URL('../app/admin/settlements/page.tsx', import.meta.url)
const boundaryEditorComponent = new URL('../components/admin/BoundaryEditor.tsx', import.meta.url)
const dataTableComponent = new URL('../components/ui/DataTable.tsx', import.meta.url)
const draggableMapPanelComponent = new URL('../components/ui/DraggableMapPanel.tsx', import.meta.url)
const mapViewComponent = new URL('../components/MapView.tsx', import.meta.url)
const mapOrientationControlsComponent = new URL('../components/MapOrientationControls.tsx', import.meta.url)
const layerSwitcherComponent = new URL('../components/LayerSwitcher.tsx', import.meta.url)
const settlementContextComponent = new URL('../components/SettlementContextBar.tsx', import.meta.url)
const quickFiltersComponent = new URL('../components/ui/QuickFilters.tsx', import.meta.url)
const plotCardListComponent = new URL('../components/PlotCardList.tsx', import.meta.url)
const plotPopupComponent = new URL('../components/ui/PlotPopup.tsx', import.meta.url)
const statusLegendComponent = new URL('../components/StatusLegend.tsx', import.meta.url)
const leadFormComponent = new URL('../components/ui/LeadForm.tsx', import.meta.url)
const clipboardModule = new URL('../lib/clipboard.ts', import.meta.url)
const logPanelComponent = new URL('../components/ui/LogPanel.tsx', import.meta.url)
const searchBarComponent = new URL('../components/ui/SearchBar.tsx', import.meta.url)
const plotMapLayersModule = new URL('../lib/plot-map-layers.ts', import.meta.url)
const roadMapLayersModule = new URL('../lib/road-map-layers.ts', import.meta.url)
const persistentBooleanModule = new URL('../lib/use-persistent-boolean.ts', import.meta.url)
const apiClient = new URL('../lib/api.ts', import.meta.url)
const constantsModule = new URL('../lib/constants.ts', import.meta.url)
const backendPlotsApi = new URL('../../backend/app/api/v1/plots.py', import.meta.url)
const mapTilesModule = new URL('../lib/map-tiles.ts', import.meta.url)
const nginxMapLocation = new URL('../../deploy/nginx/corner-bright-landscanner-map.conf', import.meta.url)
const nginxConfig = new URL('../../nginx.conf', import.meta.url)
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
  assert.match(plotLayers, /'fill-opacity': 0\.55/)
  assert.match(plotLayers, /id: 'plots-border'/)
  assert.match(plotLayers, /'line-join': 'round'/)
  assert.match(plotLayers, /'line-cap': 'round'/)
  assert.match(plotLayers, /'line-width': \['interpolate'/)
  assert.match(plotLayers, /'line-opacity': 0\.95/)
  assert.doesNotMatch(plotLayers, /id: 'plots-points'/)
  assert.doesNotMatch(mapView, /'fill-opacity': 0\.18/)
  assert.doesNotMatch(layerSwitcher, /'fill-opacity': 0\.18/)
})

test('home map keeps a selected plot Pin and status-colored highlight', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')

  assert.match(home, /selectedPlot=\{selectedPlot\}/)
  assert.match(home, /api\.plots\.get\(String\(props\.id\)\)/)
  assert.match(home, /popupPlot/)
  assert.match(home, /onClose=\{\(\) => setPopupPlot\(null\)\}/)
  assert.match(mapView, /selected-plot/)
  assert.match(mapView, /new maplibregl\.Marker\(\{ color: statusColor \}\)/)
  assert.match(mapView, /selectedMarkerRef\.current\?\.remove\(\)/)
  assert.match(mapView, /map\.(on|once)\('style\.load'/)
  assert.match(mapView, /setTimeout\(\(\) => \{[\s\S]*renderSelectedPlot\(map, selectedPlotRef\.current\)/)
})

test('home map keeps the layer switcher above the selected plot popup', async () => {
  const home = await readFile(homePage, 'utf8')

  assert.match(home, /absolute top-4 right-12 sm:right-16 z-30/)
})

test('right-side map controls show a live numeric zoom level between zoom buttons', async () => {
  const controls = await readFile(mapOrientationControlsComponent, 'utf8')
  const zoomInIndex = controls.indexOf('aria-label="Увеличить масштаб"')
  const zoomLevelIndex = controls.indexOf('aria-label={`Текущий уровень масштаба ${zoom.toFixed(1)}`}')
  const zoomOutIndex = controls.indexOf('aria-label="Уменьшить масштаб"')

  assert.match(controls, /const \[zoom, setZoom\] = useState\(\(\) => map\.getZoom\(\)\)/)
  assert.match(controls, /map\.on\('zoom', syncZoom\)/)
  assert.match(controls, /map\.off\('zoom', syncZoom\)/)
  assert.match(controls, /Z \{zoom\.toFixed\(1\)\}/)
  assert.ok(zoomInIndex >= 0)
  assert.ok(zoomInIndex < zoomLevelIndex)
  assert.ok(zoomLevelIndex < zoomOutIndex)
})

test('plot map layers expose white cadastral borders and a status legend', async () => {
  const plotLayers = await readFile(plotMapLayersModule, 'utf8')
  const constants = await readFile(constantsModule, 'utf8')
  const statusLegend = await readFile(statusLegendComponent, 'utf8')

  assert.match(constants, /STATUS_COLORS/)
  assert.match(plotLayers, /'line-color': '#ffffff'/)
  assert.match(statusLegend, /STATUS_LABELS/)
  assert.match(statusLegend, /STATUS_COLORS/)
})

test('road map layers use the approved neutral asphalt palette and OpenMapTiles classes', async () => {
  const roads = await readFile(roadMapLayersModule, 'utf8')
  const constants = await readFile(constantsModule, 'utf8')

  assert.match(constants, /ROAD_CASING_COLOR = '#4B5563'/)
  assert.match(constants, /ROAD_SURFACE_COLOR = '#D9DEE5'/)
  assert.match(roads, /ROAD_CASING_COLOR, ROAD_SURFACE_COLOR/)
  assert.match(roads, /'source-layer': 'transportation'/)
  assert.match(roads, /\/tiles\/roads\/tiles\.json/)
  assert.match(roads, /motorway/)
  assert.match(roads, /trunk/)
  assert.match(roads, /primary/)
  assert.match(roads, /secondary/)
  assert.match(roads, /tertiary/)
  assert.match(roads, /street_limited/)
  assert.match(roads, /service/)
  assert.match(roads, /track/)
  assert.match(roads, /'line-dasharray'/)
  assert.match(roads, /minzoom: 13/)
  assert.match(roads, /map\.getSource\(ROAD_SOURCE_ID\)/)
  assert.match(roads, /map\.getLayer\(layer\.id\)/)
  assert.match(roads, /beforeLayerId\?: string/)
  assert.match(roads, /map\.moveLayer\(layerId, beforeId\)/)
  assert.doesNotMatch(roads, /if \(!map\.isStyleLoaded\(\)\) return/)
  assert.match(roads, /© OpenStreetMap contributors/)
})

test('public maps expose and persist the OSM road layer across style switches', async () => {
  const home = await readFile(homePage, 'utf8')
  const standaloneMap = await readFile(standaloneMapPage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const persistence = await readFile(persistentBooleanModule, 'utf8')

  for (const page of [home, standaloneMap]) {
    assert.match(page, /usePersistentBoolean\('landsearch:roads-visible', true\)/)
    assert.match(page, /showRoads=\{showRoads\}/)
    assert.match(page, /onRoadsChange=\{setShowRoads\}/)
  }

  assert.match(mapView, /showRoads = true/)
  assert.match(mapView, /showRoadsRef\.current = showRoads/)
  assert.match(mapView, /addPlotTileLayers\(map, tileUrlRef\.current\)[\s\S]{0,160}addRoadLayers\(map, showRoadsRef\.current, 'plots-border'\)/)
  assert.match(mapView, /setRoadLayerVisibility\(map, showRoads\)/)

  assert.match(layerSwitcher, /id="osm-roads"/)
  assert.match(layerSwitcher, /Дороги/)
  assert.match(layerSwitcher, /Нейтральный асфальт/)
  assert.match(layerSwitcher, /OpenStreetMap/)
  assert.match(layerSwitcher, /-right-9[\s\S]{0,120}sm:right-0/)
  assert.match(layerSwitcher, /addPlotTileLayers\(map, tileUrlRef\.current\)[\s\S]{0,160}addRoadLayers\(map, showRoads, 'plots-border'\)/)
  assert.match(layerSwitcher, /setRoadLayerVisibility/)

  assert.match(persistence, /safeGet\(key\)/)
  assert.match(persistence, /stored === 'true' \|\| stored === 'false'/)
  assert.match(persistence, /if \(hydrated\) safeSet\(key, String\(value\)\)/)
})

test('plot, settlement and boundary editor maps use the same road overlay', async () => {
  const plotDetail = await readFile(plotDetailPage, 'utf8')
  const settlement = await readFile(settlementPage, 'utf8')
  const boundaryEditor = await readFile(boundaryEditorComponent, 'utf8')

  for (const source of [plotDetail, settlement, boundaryEditor]) {
    assert.match(source, /import \{ addRoadLayers \} from '@\/lib\/road-map-layers'/)
  }

  assert.match(plotDetail, /map\.on\('load', \(\) => \{[\s\S]{0,120}addDetailPlotLayer[\s\S]{0,120}addRoadLayers\(map, true, 'detail-plot-border'\)/)
  assert.match(plotDetail, /const reinit = \(\) => \{[\s\S]{0,180}addDetailPlotLayer[\s\S]{0,120}addRoadLayers\(map, true, 'detail-plot-border'\)/)
  assert.match(settlement, /const safeAdd = \(\) => \{[\s\S]{0,120}addLayers[\s\S]{0,120}addRoadLayers\(map, true, 'plots-border'\)/)
  assert.match(boundaryEditor, /addRoadLayers\(map, true, 'admin-plots-border'\)/)
})

test('parcels with road VRI use the neutral road fill ahead of sale status', async () => {
  const constants = await readFile(constantsModule, 'utf8')
  const plotLayers = await readFile(plotMapLayersModule, 'utf8')
  const roadLayers = await readFile(roadMapLayersModule, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const plotDetail = await readFile(plotDetailPage, 'utf8')
  const boundaryEditor = await readFile(boundaryEditorComponent, 'utf8')
  const backend = await readFile(backendPlotsApi, 'utf8')

  assert.match(constants, /export const ROAD_SURFACE_COLOR = '#D9DEE5'/)
  assert.match(constants, /export function buildPlotFillExpr\(\)/)
  assert.match(constants, /\['==', \['get', 'vri_code'\], 'ТРАНСПОРТ'\]/)
  assert.match(constants, /ROAD_SURFACE_COLOR,\s*buildStatusFillExpr\(\)/)
  assert.match(constants, /export function plotFillColor\(/)
  assert.match(constants, /normalizeVRI\(permittedUse\) === 'ТРАНСПОРТ'/)
  assert.match(constants, /\['ТРАНСПОРТ', 'дорог'\]/)
  assert.match(backend, /p\.permitted_use ILIKE '%дорог%'/)

  assert.match(plotLayers, /'fill-color': buildPlotFillExpr\(\)/)
  assert.match(plotLayers, /'circle-color': buildPlotFillExpr\(\)/)
  assert.match(roadLayers, /ROAD_CASING_COLOR, ROAD_SURFACE_COLOR/)
  assert.match(mapView, /plotFillColor\(status, plot\.vri_code \|\| plot\.permitted_use \|\| plot\.use\)/)
  assert.match(plotDetail, /plotFillColor\(plot\.status, plot\.permitted_use\)/)
  assert.match(boundaryEditor, /'fill-color': buildPlotFillExpr\(\)/)
})

test('result tray supports hidden, compact, expanded and resizable states', async () => {
  const home = await readFile(homePage, 'utf8')
  const plotCards = await readFile(plotCardListComponent, 'utf8')

  assert.match(home, /resultTrayHeight/)
  assert.match(home, /setResultTrayHeight/)
  assert.match(plotCards, /Скрыть список участков/)
  assert.match(plotCards, /Показать список участков/)
  assert.match(plotCards, /Развернуть список участков/)
  assert.match(plotCards, /Свернуть список участков/)
  assert.match(plotCards, /Максимальный размер списка участков/)
  assert.match(plotCards, /Вернуть размер списка участков/)
  assert.match(plotCards, /sm:right-4/)
  assert.match(plotCards, /ResizeHandle/)
})

test('plot fills preserve status colors as the fallback and only render a point fallback for point geometries', async () => {
  const plotLayers = await readFile(plotMapLayersModule, 'utf8')

  assert.match(plotLayers, /buildPlotFillExpr/)
  assert.match(plotLayers, /'fill-color': buildPlotFillExpr\(\)/)
  assert.doesNotMatch(plotLayers, /plots-points/)
  assert.match(plotLayers, /id: PLOT_POINT_FALLBACK_LAYER_ID/)
  assert.match(plotLayers, /filter: \['==', \['geometry-type'\], 'Point'\]/)
})

test('satellite layers include transparent street and place labels', async () => {
  const constants = await readFile(constantsModule, 'utf8')
  const satelliteSource = constants.slice(constants.indexOf("id: 'satellite'"), constants.indexOf("id: 'hybrid'"))

  assert.match(satelliteSource, /basemaps\.cartocdn\.com/)
  assert.match(satelliteSource, /satellite-labels/)
  assert.match(satelliteSource, /maxzoom: 17/)
  assert.match(satelliteSource, /raster-opacity/)
})

test('map GeoJSON and popup expose extended cadastral object data', async () => {
  const backend = await readFile(backendPlotsApi, 'utf8')
  const popup = await readFile(plotPopupComponent, 'utf8')

  assert.match(backend, /"address": p\.address/)
  assert.match(backend, /"description": p\.description/)
  assert.match(backend, /"price_per_hectare": p\.price_per_hectare/)
  assert.match(backend, /"vri_code": normalize_vri\(p\.permitted_use\)/)
  assert.match(popup, /plot\.permitted_use \|\| plot\.use/)
  assert.match(popup, /plot\.cadastral_value/)
  assert.match(popup, /plot\.object_type/)
  assert.match(popup, /plot\.description/)
})

test('admin exposes tenant-scoped bulk status editing', async () => {
  const adminPlots = await readFile(adminPlotsPage, 'utf8')
  const api = await readFile(apiClient, 'utf8')
  const backend = await readFile(backendPlotsApi, 'utf8')
  const dataTable = await readFile(dataTableComponent, 'utf8')

  assert.match(api, /bulkUpdateStatus/)
  assert.match(adminPlots, /api\.plots\.bulkUpdateStatus/)
  assert.match(adminPlots, /Массовое изменение статуса/)
  assert.match(adminPlots, /selectedRows\.map\(\(row\) => row\.id\)/)
  assert.match(adminPlots, /selectionResetToken/)
  assert.match(dataTable, /selectionResetToken\?: number/)
  assert.match(backend, /@router\.patch\("\/bulk\/status"/)
  assert.match(backend, /PlotStatusHistory/)
})

test('admin exposes manual settlement boundary editor with polygon and radius modes', async () => {
  const adminLayoutSource = await readFile(adminLayout, 'utf8')
  const api = await readFile(apiClient, 'utf8')
  const page = await readFile(adminSettlementsPage, 'utf8')
  const editor = await readFile(boundaryEditorComponent, 'utf8')
  const editorSource = `${page}\n${editor}`

  assert.match(adminLayoutSource, /key: '\/admin\/settlements'/)
  assert.match(adminLayoutSource, /Границы/)
  assert.match(api, /previewBoundary/)
  assert.match(api, /updateBoundary/)
  assert.match(api, /excluded: number/)
  assert.match(api, /unlinked: number/)
  assert.match(editorSource, /Нарисовать полигон/)
  assert.match(editorSource, /Радиус, м/)
  assert.match(editorSource, /Сохранить границу/)
  assert.match(editorSource, /Сбросить границу/)
  assert.match(editorSource, /Посчитать участки по границе/)
  assert.match(editorSource, /Импортировать участки NSPD по границе/)
  assert.match(editorSource, /внутри не более 50%/)
  assert.match(editorSource, /более чем на 50% площади внутри границы/)
  assert.match(editorSource, /отвязано за границей/)
  assert.match(editorSource, /boundary/)
  assert.match(editorSource, /cursor-crosshair/)
  assert.match(editorSource, /map\.unproject/)
  assert.match(editorSource, /map\.on\('load', onLoad\)/)
  assert.match(editorSource, /ref=\{mapContainerRef\} className="h-full w-full"/)
  assert.match(editorSource, /Координаты/)
  assert.match(editorSource, /toFixed\(6\)/)
  assert.match(editorSource, /ls-boundary-point/)
  assert.match(editorSource, /index \+ 1/)
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

test('plot detail copy action has a browser clipboard fallback', async () => {
  const detail = await readFile(plotDetailPage, 'utf8')
  const clipboard = await readFile(clipboardModule, 'utf8')

  assert.match(detail, /copyText\(plot\.cadastral_number\)/)
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/)
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(clipboard, /return true/)
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

test('base-layer switches serialize rapid user clicks before replacing map styles', async () => {
  const detail = await readFile(plotDetailPage, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')

  for (const source of [detail, layerSwitcher]) {
    assert.match(source, /queuedLayerRef/)
    assert.match(source, /style\.load/)
    assert.match(source, /idle/)
    assert.match(source, /setTimeout\(finish, 4000\)/)
    assert.match(source, /setTimeout\(finish, 6000\)/)
  }
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

test('admin plots table keeps full text visible when columns are resized', async () => {
  const adminPlots = await readFile(adminPlotsPage, 'utf8')
  const dataTable = await readFile(dataTableComponent, 'utf8')

  assert.doesNotMatch(adminPlots, /truncate max-w-\[180px\]/)
  assert.match(adminPlots, /whitespace-normal break-words text-xs leading-5/)
  assert.match(dataTable, /w-full min-w-full table-fixed text-sm/)
  assert.match(dataTable, /whitespace-normal break-words align-top/)
  assert.match(dataTable, /width: cell\.column\.getSize\(\)/)
  assert.match(dataTable, /column\.id === 'select'/)
  assert.match(dataTable, /Выбор строк/)
})

test('admin plots table exposes server pagination for the full NSPD dataset', async () => {
  const adminPlots = await readFile(adminPlotsPage, 'utf8')
  const dataTable = await readFile(dataTableComponent, 'utf8')

  assert.match(adminPlots, /const PAGE_SIZE_OPTIONS = \[20, 50, 100, 200\]/)
  assert.match(adminPlots, /page_size: String\(size\)/)
  assert.match(adminPlots, /params\.query = query\.trim\(\)/)
  assert.match(adminPlots, /searchQuery/)
  assert.match(adminPlots, /Источник данных: NSPD/)
  assert.match(adminPlots, /pageSize=\{pageSize\}/)
  assert.match(adminPlots, /hidePagination/)
  assert.match(adminPlots, /manualPagination/)
  assert.match(adminPlots, /setPage\(page === totalPages \? 1 : page \+ 1\)/)
  assert.match(dataTable, /hidePagination\?: boolean/)
  assert.match(dataTable, /manualPagination\?: boolean/)
  assert.match(dataTable, /searchValue\?: string/)
  assert.match(dataTable, /onSearchChange\?: \(value: string\) => void/)
  assert.match(dataTable, /manualFiltering\?: boolean/)
  assert.match(dataTable, /manualPagination,/)
  assert.match(dataTable, /current\.pageSize === pageSize/)
})

test('shared layout primitives expose accessible resize and persistence contracts', async () => {
  const resizeHandle = await readFile(new URL('../components/ui/ResizeHandle.tsx', import.meta.url), 'utf8')
  const layoutHook = await readFile(new URL('../lib/use-persistent-layout.ts', import.meta.url), 'utf8')
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

  assert.match(resizeHandle, /role="separator"/)
  assert.match(resizeHandle, /aria-valuemin/)
  assert.match(resizeHandle, /onPointerDown/)
  assert.match(resizeHandle, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/)
  assert.match(layoutHook, /safeGet/)
  assert.match(layoutHook, /safeSet/)
  assert.match(css, /--ls-green: #237a63/)
  assert.match(css, /prefers-reduced-motion/)
})

test('public search shell exposes map-first resizable workspace controls', async () => {
  const home = await readFile(homePage, 'utf8')
  const filterPanel = await readFile(new URL('../components/ui/FilterPanel.tsx', import.meta.url), 'utf8')
  const searchBar = await readFile(searchBarComponent, 'utf8')
  const layerSwitcher = await readFile(layerSwitcherComponent, 'utf8')
  const statusLegend = await readFile(statusLegendComponent, 'utf8')

  assert.match(home, /usePersistentLayout/)
  assert.match(home, /ResizeHandle/)
  assert.match(home, /filterRailWidth/)
  assert.match(home, /resultTrayHeight/)
  assert.match(home, /onClose={\(\) => setShowFilters\(false\)\}/)
  assert.match(home, /matchMedia\('\(max-width: 767px\)'\)/)
  assert.match(home, /className="hidden md:block md:flex-1 md:max-w-xl"/)
  assert.match(home, /className="hidden md:flex items-center gap-1 sm:gap-2"/)
  assert.match(home, /bg-\[var\(--ls-green\)\]/)
  assert.match(filterPanel, /width\?: number/)
  assert.match(filterPanel, /onClose\?: \(\) => void/)
  assert.match(searchBar, /aria-label="Поиск по кадастровому номеру, адресу или поселку"/)
  assert.match(layerSwitcher, /aria-label="Подложка карты"/)
  assert.match(statusLegend, /aria-label="Легенда статусов участков"/)
})

test('plot result tray and popup keep selection accessible and resizable', async () => {
  const home = await readFile(homePage, 'utf8')
  const plotCards = await readFile(plotCardListComponent, 'utf8')
  const popup = await readFile(plotPopupComponent, 'utf8')

  assert.match(home, /resultTrayHeight/)
  assert.match(home, /onHeightChange=/)
  assert.match(plotCards, /ResizeHandle/)
  assert.match(plotCards, /selectedPlotId\?: string/)
  assert.match(plotCards, /aria-selected=/)
  assert.match(popup, /role="dialog"/)
  assert.match(popup, /aria-modal="true"/)
  assert.match(popup, /aria-label="Закрыть карточку участка"/)
  assert.doesNotMatch(popup, /bg-gradient-to-r/)
})

test('admin workspace uses the shared map-first design system responsively', async () => {
  const layout = await readFile(adminLayout, 'utf8')
  const dashboard = await readFile(adminDashboardPage, 'utf8')
  const leads = await readFile(adminLeadsPage, 'utf8')
  const plots = await readFile(adminPlotsPage, 'utf8')
  const importPage = await readFile(new URL('../app/admin/import/page.tsx', import.meta.url), 'utf8')
  const settings = await readFile(new URL('../app/admin/settings/page.tsx', import.meta.url), 'utf8')

  assert.match(layout, /bg-\[var\(--ls-paper\)\]/)
  assert.match(layout, /aria-label="Открыть навигацию"/)
  assert.match(layout, /md:hidden/)
  assert.match(dashboard, /var\(--ls-surface\)/)
  assert.match(leads, /var\(--ls-surface\)/)
  assert.match(importPage, /var\(--ls-surface\)/)
  assert.match(settings, /var\(--ls-surface\)/)
  assert.match(plots, /flex-col items-start gap-3 sm:flex-row/)
  assert.match(plots, /w-full sm:w-auto/)
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
  assert.match(home, /api\.settlements\.get\(suggestion\.id, \{ include_plots: false \}\)/)
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
  assert.match(mapView, /longitudeSpan < 0\.01 && latitudeSpan < 0\.01 \? 16 : 15/)
  assert.match(layerSwitcher, /const tileUrlRef = useRef\(buildPlotTileUrl\(filters\)\)/)
  assert.match(layerSwitcher, /addPlotTileLayers\(map, tileUrlRef\.current\)/)
  assert.match(plotCards, /Показано \{plots\.length\} из \{total\}/)
})

test('settlement selection scopes by boundary without reapplying the settlement name as plot search text', async () => {
  const home = await readFile(homePage, 'utf8')

  assert.match(home, /suggestion\?\.type === 'settlement'/)
  assert.match(home, /delete next\.query/)
  assert.match(home, /settlement_id: suggestion\.id/)
})

test('selected settlement exposes a map context bar and explicit boundary overlay', async () => {
  const home = await readFile(homePage, 'utf8')
  const mapView = await readFile(mapViewComponent, 'utf8')
  const context = await readFile(settlementContextComponent, 'utf8')

  assert.match(home, /selectedSettlement/)
  assert.match(home, /SettlementContextBar/)
  assert.match(home, /boundaryGeometry=\{selectedSettlement\?\.geometry\}/)
  assert.match(mapView, /boundaryGeometry\?: Record<string, unknown> \| null/)
  assert.match(mapView, /selected-settlement-boundary/)
  assert.match(context, /Контекст выбранной территории/)
  assert.match(context, /Сбросить территорию/)
  assert.match(context, /free_plots/)
  assert.match(context, /reserved_plots/)
  assert.match(context, /booked_plots/)
  assert.match(context, /sold_plots/)
})

test('quick filters provide status and high-signal price and area shortcuts', async () => {
  const home = await readFile(homePage, 'utf8')
  const quickFilters = await readFile(quickFiltersComponent, 'utf8')

  assert.match(home, /QuickFilters/)
  assert.match(quickFilters, /Только свободные/)
  assert.match(quickFilters, /До 5 млн ₽/)
  assert.match(quickFilters, /10 соток\+/)
  assert.match(quickFilters, /toggle\('status', 'free'\)/)
  assert.match(quickFilters, /toggle\('price_max', '5000000'\)/)
  assert.match(quickFilters, /toggle\('area_min', '1000'\)/)
  assert.match(quickFilters, /bottom-\[calc\(var\(--result-tray-height\)\+1rem\)\]/)
})

test('map panels share persistent pinned pointer and keyboard movement', async () => {
  const source = await readFile(draggableMapPanelComponent, 'utf8')

  assert.match(source, /safeGet/)
  assert.match(source, /safeSet/)
  assert.match(source, /pinned:\s*true/)
  assert.match(source, /setPointerCapture/)
  assert.match(source, /releasePointerCapture/)
  assert.match(source, /interactiveTarget !== event\.currentTarget/)
  assert.match(source, /pointermove/)
  assert.match(source, /getBoundingClientRect/)
  assert.match(source, /max-width:\s*767px/)
  assert.match(source, /ArrowLeft/)
  assert.match(source, /ArrowRight/)
  assert.match(source, /ArrowUp/)
  assert.match(source, /ArrowDown/)
  assert.match(source, /event\.key === 'Home'/)
  assert.match(source, /PinOff/)
  assert.match(source, /RotateCcw/)
})

test('plot popup, quick filters and results keep independent draggable positions', async () => {
  const popup = await readFile(plotPopupComponent, 'utf8')
  const quickFilters = await readFile(quickFiltersComponent, 'utf8')
  const results = await readFile(plotCardListComponent, 'utf8')

  assert.match(popup, /DraggableMapPanel/)
  assert.match(popup, /landsearch:panel:plot/)
  assert.match(popup, /PanelPositionControls/)
  assert.match(popup, /dragHandleProps/)

  assert.match(quickFilters, /DraggableMapPanel/)
  assert.match(quickFilters, /landsearch:panel:quick-filters/)
  assert.match(quickFilters, /PanelPositionControls/)
  assert.match(quickFilters, /dragHandleProps/)

  assert.match(results, /DraggableMapPanel/)
  assert.match(results, /landsearch:panel:results/)
  assert.match(results, /PanelPositionControls/)
  assert.match(results, /dragHandleProps/)
  assert.match(results, /GripVertical/)
  assert.match(results, /disabled=\{maximized\}/)
})

test('plot popup shows price per sotka and NSPD source context', async () => {
  const popup = await readFile(plotPopupComponent, 'utf8')

  assert.match(popup, /Цена за сотку/)
  assert.match(popup, /Источник: NSPD/)
  assert.match(popup, /updated_at/)
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

test('Nginx proxies and caches same-origin OpenFreeMap road tiles', async () => {
  const source = await readFile(nginxConfig, 'utf8')

  assert.match(source, /proxy_cache_path \/var\/cache\/nginx\/landsearch-roads/)
  assert.match(source, /keys_zone=roads_tiles:32m/)
  assert.match(source, /location = \/tiles\/roads\/tiles\.json/)
  assert.match(source, /proxy_pass https:\/\/tiles\.openfreemap\.org\/planet;/)
  assert.match(source, /proxy_set_header Accept-Encoding "";/)
  assert.match(source, /sub_filter_types application\/json;/)
  assert.match(source, /sub_filter 'https:\/\/tiles\.openfreemap\.org\/planet\/' '\$scheme:\/\/\$host\/tiles\/roads\/';/)
  assert.match(source, /location \/tiles\/roads\//)
  assert.match(source, /proxy_pass https:\/\/tiles\.openfreemap\.org\/planet\//)
  assert.match(source, /proxy_cache_use_stale error timeout invalid_header updating http_500 http_502 http_503 http_504;/)
  assert.match(source, /X-Road-Tile-Cache/)
  assert.match(source, /Access-Control-Allow-Origin "\*" always/)
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
