import type { StyleSpecification } from 'maplibre-gl'

export const MAP_GLYPHS_URL = '/settlement-map-glyphs/{fontstack}/{range}.pbf'
export const MAP_LABEL_FONT = 'Noto Sans Regular'

export interface BaseLayerDef {
  id: string
  name: string
  icon: string
  style: StyleSpecification
}

export const STATUS_COLORS: Record<string, string> = {
  free: '#22c55e',
  reserved: '#eab308',
  booked: '#f97316',
  sold: '#ef4444',
}

export const ROAD_CASING_COLOR = '#4B5563'
export const ROAD_SURFACE_COLOR = '#D9DEE5'

export const STATUS_LABELS: Record<string, string> = {
  free: 'Свободен',
  reserved: 'В резерве',
  booked: 'Забронирован',
  sold: 'Продан',
}

export const STATUS_STYLES: Record<string, string> = {
  free: 'bg-green-100 text-green-700',
  reserved: 'bg-yellow-100 text-yellow-700',
  booked: 'bg-orange-100 text-orange-700',
  sold: 'bg-red-100 text-red-700',
}

/* ── ВРИ (вид разрешённого использования) — цвета и нормализация ── */

export const VRI_COLORS: Record<string, string> = {
  ИЖС: '#009E73',
  ЛПХ: '#8C510A',
  СНТ: '#E69F00',
  ОГОРОД: '#AEEA00',
  ДНП: '#CC79A7',
  ОГП: '#D55E00',
  ГАРАЖ: '#8D6E63',
  КОМ: '#C51B7D',
  СКЛАД: '#9E9D24',
  ПРОМ: '#6B7280',
  КОММУН: '#26C6DA',
  СХ: '#F0E442',
  СПОРТ: '#26A69A',
  РИТУАЛ: '#5D4037',
  ОТДЫХ: '#56B4E9',
  ЖИЛОЙ: '#0072B2',
  СОЦИАЛЬНЫЙ: '#7CB342',
  ТРАНСПОРТ: ROAD_SURFACE_COLOR,
  СВЯЗЬ: '#A78BFA',
  ОБОРОНА: '#111827',
  ЛЕСНОЙ: '#006D2C',
  ВОДНЫЙ: '#1D4ED8',
  СПЕЦИАЛЬНЫЙ: '#374151',
  ЗАПАС: '#78909C',
  ПУСТЫРЬ: '#BDBDBD',
  ДРУГОЕ: '#0891B2',
}

export const VRI_DEFAULT_COLOR = '#0891B2'

const VRI_RULES: [string, string][] = [
  ['ИЖС', 'ижс'],
  ['ИЖС', 'индивидуального жилищного'],
  ['ИЖС', 'индивидуальное жилищное'],
  ['ИЖС', 'индивидуальный жилой'],
  ['ЛПХ', 'лпх'],
  ['ЛПХ', 'личного подсобного'],
  ['ЛПХ', 'личное подсобное'],
  ['ЛПХ', 'приусадебн'],
  ['ЛПХ', 'подсобного хозяйства'],
  ['СНТ', 'снт'],
  ['СНТ', 'садоводств'],
  ['СНТ', 'садов'],
  ['ОГОРОД', 'огород'],
  ['ДНП', 'днп'],
  ['ДНП', 'дачн'],
  ['ЖИЛОЙ', 'многоквартирн'],
  ['ЖИЛОЙ', 'среднеэтажн'],
  ['ЖИЛОЙ', 'малоэтажн'],
  ['ЖИЛОЙ', 'блокированн'],
  ['ЖИЛОЙ', 'жилищное строительств'],
  ['ОГП', 'общего пользования'],
  ['ОГП', 'благоустройство территории'],
  ['ГАРАЖ', 'гараж'],
  ['ГАРАЖ', 'стоянк'],
  ['ГАРАЖ', 'хранение автотранспорт'],
  ['ТРАНСПОРТ', 'транспорт'],
  ['ТРАНСПОРТ', 'автомобиль'],
  ['ТРАНСПОРТ', 'автодорог'],
  ['ТРАНСПОРТ', 'дорожн'],
  ['ТРАНСПОРТ', 'дорог'],
  ['КОМ', 'торгов'],
  ['КОМ', 'магазин'],
  ['КОМ', 'общественного питания'],
  ['КОМ', 'предпринимат'],
  ['КОМ', 'делов'],
  ['КОМ', 'банк'],
  ['КОМ', 'гостинич'],
  ['КОМ', 'офис'],
  ['КОМ', 'рынок'],
  ['КОМ', 'развлечен'],
  ['КОМ', 'бытовое обслуживание'],
  ['КОМ', 'сервис'],
  ['СКЛАД', 'склад'],
  ['ПРОМ', 'промышлен'],
  ['ПРОМ', 'производствен'],
  ['ПРОМ', 'недропользован'],
  ['КОММУН', 'коммунальн'],
  ['КОММУН', 'энергетик'],
  ['КОММУН', 'электро'],
  ['КОММУН', 'инженерн'],
  ['КОММУН', 'газоснабж'],
  ['КОММУН', 'водоснабж'],
  ['КОММУН', 'теплоснабж'],
  ['СВЯЗЬ', 'связь'],
  ['СХ', 'сельскохозяйствен'],
  ['СХ', 'животноводств'],
  ['СХ', 'растениеводств'],
  ['СХ', 'выращивани'],
  ['СХ', 'сенокош'],
  ['СХ', 'выпас'],
  ['СХ', 'фермерск'],
  ['СХ', 'кфх'],
  ['СПОРТ', 'спорт'],
  ['СПОРТ', 'физкультур'],
  ['ОТДЫХ', 'отдых'],
  ['ОТДЫХ', 'рекреац'],
  ['ОТДЫХ', 'турист'],
  ['ОТДЫХ', 'санатор'],
  ['РИТУАЛ', 'ритуальн'],
  ['РИТУАЛ', 'кладбищ'],
  ['СОЦИАЛЬНЫЙ', 'социальн'],
  ['СОЦИАЛЬНЫЙ', 'образован'],
  ['СОЦИАЛЬНЫЙ', 'здравоохранен'],
  ['СОЦИАЛЬНЫЙ', 'больниц'],
  ['СОЦИАЛЬНЫЙ', 'медицин'],
  ['СОЦИАЛЬНЫЙ', 'культур'],
  ['СОЦИАЛЬНЫЙ', 'библиотек'],
  ['ЛЕСНОЙ', 'лесн'],
  ['ВОДНЫЙ', 'водн'],
  ['ВОДНЫЙ', 'гидротехн'],
  ['ОБОРОНА', 'оборон'],
  ['ОБОРОНА', 'безопасность'],
  ['СПЕЦИАЛЬНЫЙ', 'специальн'],
  ['ЗАПАС', 'запас'],
  ['ПУСТЫРЬ', 'пустыр'],
]

export function normalizeVRI(use: string | null | undefined): string {
  if (!use) return 'ДРУГОЕ'
  const lower = use.toLowerCase()
  for (const [code, keyword] of VRI_RULES) {
    if (lower.includes(keyword)) return code
  }
  return 'ДРУГОЕ'
}

export function vriColor(use: string | null | undefined): string {
  return VRI_COLORS[normalizeVRI(use)] || VRI_DEFAULT_COLOR
}

export function plotFillColor(status: string | null | undefined, permittedUse?: string | null): string {
  if (normalizeVRI(permittedUse) === 'ТРАНСПОРТ') return ROAD_SURFACE_COLOR
  return STATUS_COLORS[String(status || '')] || '#9ca3af'
}

/* ── MapLibre match-выражения для раскраски MVT слоёв по vri_code ── */

const _darken = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `#${[r, g, b].map(c => Math.round(c * 0.6).toString(16).padStart(2, '0')).join('')}`
}

export function buildVriFillExpr(): any[] {
  const expr: any[] = ['match', ['get', 'vri_code']]
  for (const [code, color] of Object.entries(VRI_COLORS)) {
    expr.push(code, color)
  }
  expr.push(VRI_DEFAULT_COLOR)
  return expr
}

export function buildVriBorderExpr(): any[] {
  const expr: any[] = ['match', ['get', 'vri_code']]
  for (const [code, color] of Object.entries(VRI_COLORS)) {
    expr.push(code, _darken(color))
  }
  expr.push(_darken(VRI_DEFAULT_COLOR))
  return expr
}

export function buildStatusFillExpr(): any[] {
  const expr: any[] = ['match', ['get', 'status']]
  for (const [status, color] of Object.entries(STATUS_COLORS)) expr.push(status, color)
  expr.push('#9ca3af')
  return expr
}

export function buildPlotFillExpr(): any[] {
  return [
    'case',
    ['==', ['get', 'vri_code'], 'ТРАНСПОРТ'],
    ROAD_SURFACE_COLOR,
    buildStatusFillExpr(),
  ]
}

export function buildStatusBorderExpr(): any[] {
  const expr: any[] = ['match', ['get', 'status']]
  for (const [status, color] of Object.entries(STATUS_COLORS)) expr.push(status, _darken(color))
  expr.push('#4b5563')
  return expr
}

export const DEFAULT_BASE_LAYER_ID = 'landscanner'

const TILE_PROXY_URLS = {
  esriImagery: '/tiles/esri/imagery/{z}/{y}/{x}',
  osm: '/tiles/osm/{z}/{x}/{y}.png',
  topo: '/tiles/topo/{z}/{x}/{y}.png',
  cartoLabels: '/tiles/carto/labels/{z}/{x}/{y}.png',
  cartoLight: '/tiles/carto/light/{z}/{x}/{y}@2x.png',
  cartoDark: '/tiles/carto/dark/{z}/{x}/{y}@2x.png',
  cartoVoyager: '/tiles/carto/voyager/{z}/{x}/{y}@2x.png',
  cyclosm: '/tiles/cyclosm/{z}/{x}/{y}.png',
} as const

export const BASE_LAYERS: BaseLayerDef[] = [
  {
    id: 'landscanner',
    name: 'LandScanner',
    icon: 'satellite',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        imagery: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.esriImagery],
          tileSize: 256,
          attribution: '© Esri',
        },
        labels: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoLabels],
          tileSize: 256,
          attribution: '© CARTO',
        },
      },
      layers: [
        { id: 'landscanner-imagery', type: 'raster', source: 'imagery' },
        { id: 'landscanner-labels', type: 'raster', source: 'labels', maxzoom: 19 },
      ],
    },
  },
  {
    id: 'osm',
    name: 'Схема',
    icon: 'map',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        osm: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.osm],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  },
  {
    id: 'satellite',
    name: 'Спутник',
    icon: 'satellite',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        esri: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.esriImagery],
          tileSize: 256,
          attribution: '© Esri',
        },
        labels: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoLabels],
          tileSize: 256,
          attribution: '© CARTO',
        },
      },
      layers: [
        { id: 'esri', type: 'raster', source: 'esri' },
        { id: 'satellite-labels', type: 'raster', source: 'labels', maxzoom: 17, paint: { 'raster-opacity': 0.55 } },
      ],
    },
  },
  {
    id: 'hybrid',
    name: 'Гибрид',
    icon: 'hybrid',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        esri: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.esriImagery],
          tileSize: 256,
          attribution: '© Esri',
        },
        labels: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoLabels],
          tileSize: 256,
          attribution: '© CARTO',
        },
      },
      layers: [
        { id: 'esri', type: 'raster', source: 'esri' },
        { id: 'labels', type: 'raster', source: 'labels', maxzoom: 17, paint: { 'raster-opacity': 0.55 } },
      ],
    },
  },
  {
    id: 'topo',
    name: 'Топо',
    icon: 'topo',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        topo: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.topo],
          tileSize: 256,
          attribution: '© OpenTopoMap',
        },
      },
      layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
    },
  },
  {
    id: 'light',
    name: 'Светлая',
    icon: 'light',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        carto: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoLight],
          tileSize: 256,
          attribution: '© CartoDB',
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    },
  },
  {
    id: 'dark',
    name: 'Тёмная',
    icon: 'dark',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        carto: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoDark],
          tileSize: 256,
          attribution: '© CartoDB',
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    },
  },
  {
    id: 'voyager',
    name: 'Турист',
    icon: 'map',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        carto: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cartoVoyager],
          tileSize: 256,
          attribution: '© CartoDB',
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    },
  },
  {
    id: 'cyclosm',
    name: 'Вело',
    icon: 'map',
    style: {
      version: 8,
      glyphs: MAP_GLYPHS_URL,
      sources: {
        cyclosm: {
          type: 'raster',
          tiles: [TILE_PROXY_URLS.cyclosm],
          tileSize: 256,
          attribution: '© CyclOSM, © OpenStreetMap',
        },
      },
      layers: [{ id: 'cyclosm', type: 'raster', source: 'cyclosm' }],
    },
  },
]
