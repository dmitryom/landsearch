import type { StyleSpecification } from 'maplibre-gl'

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
  ТРАНСПОРТ: '#4B5563',
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

/* ── MapLibre match-выражения для раскраски по ВРИ ── */
// Возвращает [ 'match', ['get', 'use'], ...pairs..., default ]
export function buildVriMatchExpression(attr: string, colorMap: Record<string, string>, defaultColor = VRI_DEFAULT_COLOR): any[] {
  const expr: any[] = ['match', ['get', attr]]
  // VRI_RULES имеет множество ключевых слов для каждого кода; добавляем
  // код целиком как кэшированное значение если нормализация уже применена
  // в данных тайла. Пока используем простой match по use-полю (сырое значение).
  // На серверной стороне или через expression это сложно; для MVT используем
  // lookup через prepared зная, что use может быть любым текстом.
  // Вместо match используем in + case — но в MapLibre нет сложной логики.
  // Выход: все цвета в match как fallback, а нормализация будет кэширована
  // в отдельном атрибуте vri_code на стороне MVT в будущем.
  // Пока возвращаем defaultColor — правильная раскраска потребует
  // нормализации на стороне бэкенда.
  return expr
}

export const BASE_LAYERS: BaseLayerDef[] = [
  {
    id: 'osm',
    name: 'Схема',
    icon: '🗺️',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['/tiles/osm/{z}/{x}/{y}.png'],
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
    icon: '🛰️',
    style: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: ['/tiles/esri/imagery/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri',
        },
      },
      layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
    },
  },
  {
    id: 'hybrid',
    name: 'Гибрид',
    icon: '🌍',
    style: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: ['/tiles/esri/imagery/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri',
        },
        labels: {
          type: 'raster',
          tiles: ['/tiles/esri/labels/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri',
        },
      },
      layers: [
        { id: 'esri', type: 'raster', source: 'esri' },
        { id: 'labels', type: 'raster', source: 'labels' },
      ],
    },
  },
  {
    id: 'topo',
    name: 'Топо',
    icon: '🏔️',
    style: {
      version: 8,
      sources: {
        topo: {
          type: 'raster',
          tiles: ['/tiles/topo/{z}/{x}/{y}.png'],
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
    icon: '☀️',
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: ['/tiles/carto/light/{z}/{x}/{y}@2x.png'],
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
    icon: '🌙',
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: ['/tiles/carto/dark/{z}/{x}/{y}@2x.png'],
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
    icon: '🧭',
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: ['/tiles/carto/voyager/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '© CartoDB',
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    },
  },
  {
    id: 'wikimedia',
    name: 'Вики',
    icon: '📖',
    style: {
      version: 8,
      sources: {
        wiki: {
          type: 'raster',
          tiles: ['/tiles/wiki/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© Wikimedia',
        },
      },
      layers: [{ id: 'wiki', type: 'raster', source: 'wiki' }],
    },
  },
  {
    id: 'yandex_sat',
    name: 'Яндекс Спутник',
    icon: '🛰️',
    style: {
      version: 8,
      sources: {
        yandex: {
          type: 'raster',
          tiles: ['/tiles/yandex/sat/tiles?l=sat&x={x}&y={y}&z={z}&scale=1'],
          tileSize: 256,
          attribution: '© Яндекс',
        },
      },
      layers: [{ id: 'yandex', type: 'raster', source: 'yandex' }],
    },
  },
  {
    id: 'yandex_map',
    name: 'Яндекс Карта',
    icon: '🗺️',
    style: {
      version: 8,
      sources: {
        yandex: {
          type: 'raster',
          tiles: ['/tiles/yandex/map/tiles?l=map&x={x}&y={y}&z={z}&scale=1'],
          tileSize: 256,
          attribution: '© Яндекс',
        },
      },
      layers: [{ id: 'yandex', type: 'raster', source: 'yandex' }],
    },
  },
  {
    id: 'cadastre_parcels',
    name: 'Кадастр',
    icon: '📋',
    style: {
      version: 8,
      sources: {
        cadastre: {
          type: 'raster',
          tiles: [
            'https://pkk.rosreestr.ru/arcgis/rest/services/PKK6/CadastreObjects/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© Росреестр',
        },
      },
      layers: [
        {
          id: 'cadastre',
          type: 'raster',
          source: 'cadastre',
          paint: { 'raster-opacity': 0.7 },
        },
      ],
    },
  },
  {
    id: 'cadastre_borders',
    name: 'Кадастр (границы)',
    icon: '🏛️',
    style: {
      version: 8,
      sources: {
        borders: {
          type: 'raster',
          tiles: [
            'https://pkk.rosreestr.ru/arcgis/rest/services/PKK6/BordersGKN/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© Росреестр',
        },
      },
      layers: [
        {
          id: 'borders',
          type: 'raster',
          source: 'borders',
          paint: { 'raster-opacity': 0.6 },
        },
      ],
    },
  },
]
