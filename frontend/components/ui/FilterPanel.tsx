'use client'

import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'

interface FilterPanelProps {
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
  width?: number
  mobile?: boolean
  onClose?: () => void
}

const PERMITTED_USES = [
  { value: 'ИЖС', label: 'Индивидуальное жилищное строительство' },
  { value: 'ЛПХ', label: 'Личное подсобное хозяйство' },
  { value: 'СНТ', label: 'Садоводство' },
  { value: 'ДНП', label: 'Дачное хозяйство' },
  { value: 'ОГП', label: 'Территории общего пользования' },
  { value: 'Коммерция', label: 'Коммерческое использование' },
]
const CATEGORIES = ['Земли населённых пунктов', 'Земли сельхозназначения', 'Земли промышленности']

const SORT_FIELDS = [
  { value: 'created_at', label: 'Сначала новые' },
  { value: 'price', label: 'По цене' },
  { value: 'area_m2', label: 'По площади' },
  { value: 'cadastral_number', label: 'По кадастровому номеру' },
]

const STATUSES = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
  color: STATUS_COLORS[value],
}))

export default function FilterPanel({ filters, onChange, width, mobile = false, onClose }: FilterPanelProps) {
  const [expanded, setExpanded] = useState<string | null>('status')

  const set = (key: string, value: string) => {
    const next = { ...filters }
    if (value) next[key] = value
    else delete next[key]
    onChange(next)
  }

  const clear = () => onChange({})

  const activeCount = Object.keys(filters).filter((key) => !['query', 'settlement_id', 'sort_by', 'sort_order'].includes(key)).length
  const selectedStatuses = (filters.status || '').split(',').filter(Boolean)

  const toggleStatus = (value: string) => {
    const nextStatuses = selectedStatuses.includes(value)
      ? selectedStatuses.filter((status) => status !== value)
      : [...selectedStatuses, value]
    set('status', nextStatuses.join(','))
  }

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(expanded === id ? null : id)}
        aria-expanded={expanded === id}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--ls-ink)] hover:bg-[#fbfdfb]"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-[var(--ls-muted)] transition-transform ${expanded === id ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded === id && <div className="px-4 pb-4">{children}</div>}
    </div>
  )

  return (
    <aside
      aria-label="Фильтры участков"
      style={width ? { width: `${width}px` } : undefined}
      className="w-72 min-w-0 bg-white border-r border-gray-200 flex flex-col shrink-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm text-[var(--ls-ink)]">Фильтры</h2>
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ls-green)] px-1 text-xs font-medium text-white" aria-label={`${activeCount} активных фильтра`}>
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
          <button type="button" onClick={clear} className="min-h-11 px-1 text-xs font-medium text-[var(--ls-blue)] hover:text-[var(--ls-green-dark)]">
            Сбросить
          </button>
          )}
          {mobile && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть фильтры"
              title="Закрыть фильтры"
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section id="sort" title="Сортировка">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Поле</span>
              <select
                value={filters.sort_by || 'created_at'}
                onChange={(e) => set('sort_by', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORT_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>{field.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Порядок</span>
              <select
                value={filters.sort_order || 'desc'}
                onChange={(e) => set('sort_order', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </label>
          </div>
        </Section>

        <Section id="price" title="Цена, ₽">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-[var(--ls-muted)]" htmlFor="price-min">От</label>
              <input
                id="price-min"
                type="number"
                aria-label="Минимальная цена"
                value={filters.price_min || ''}
                onChange={(e) => set('price_min', e.target.value)}
                className="ls-input w-full px-3 py-1.5 text-sm"
              />
            </div>
            <span className="text-gray-400 self-center">—</span>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-[var(--ls-muted)]" htmlFor="price-max">До</label>
              <input
                id="price-max"
                type="number"
                aria-label="Максимальная цена"
                value={filters.price_max || ''}
                onChange={(e) => set('price_max', e.target.value)}
                className="ls-input w-full px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </Section>

        <Section id="area" title="Площадь, соток">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-[var(--ls-muted)]" htmlFor="area-min">От, соток</label>
              <input
                id="area-min"
                type="number"
                aria-label="Минимальная площадь в сотках"
                value={filters.area_min !== undefined && filters.area_min !== '' ? String(Number(filters.area_min) / 100) : ''}
                onChange={(e) => set('area_min', e.target.value !== '' ? String(Number(e.target.value) * 100) : '')}
                className="ls-input w-full px-3 py-1.5 text-sm"
              />
            </div>
            <span className="text-gray-400 self-center">—</span>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-[var(--ls-muted)]" htmlFor="area-max">До, соток</label>
              <input
                id="area-max"
                type="number"
                aria-label="Максимальная площадь в сотках"
                value={filters.area_max !== undefined && filters.area_max !== '' ? String(Number(filters.area_max) / 100) : ''}
                onChange={(e) => set('area_max', e.target.value !== '' ? String(Number(e.target.value) * 100) : '')}
                className="ls-input w-full px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </Section>

        <Section id="vri" title="Вид разрешённого использования">
          <div className="space-y-1.5">
            {PERMITTED_USES.map((u) => (
              <label key={u.value} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.permitted_use === u.value}
                  onChange={() => set('permitted_use', filters.permitted_use === u.value ? '' : u.value)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{u.label}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section id="category" title="Категория земель">
          <div className="space-y-1.5">
            {CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.category === c}
                  onChange={() => set('category', filters.category === c ? '' : c)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{c}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section id="status" title="Статус">
          <div className="space-y-2">
            {STATUSES.map((s) => (
              <label key={s.value} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(s.value)}
                  onChange={() => toggleStatus(s.value)}
                  className="h-4 w-4 rounded border-gray-300 text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
                />
                <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{s.label}</span>
              </label>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  )
}
