'use client'

import { useState } from 'react'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'

interface FilterPanelProps {
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
}

const PERMITTED_USES = ['ИЖС', 'ЛПХ', 'СНТ', 'ДНП', 'ОГП', 'Коммерция']
const CATEGORIES = ['Земли населённых пунктов', 'Земли сельхозназначения', 'Земли промышленности']

const STATUSES = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
  color: STATUS_COLORS[value],
}))

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const [expanded, setExpanded] = useState<string | null>('price')

  const set = (key: string, value: string) => {
    const next = { ...filters }
    if (value) next[key] = value
    else delete next[key]
    onChange(next)
  }

  const clear = () => onChange({})

  const activeCount = Object.keys(filters).length

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setExpanded(expanded === id ? null : id)}
        className="w-full flex items-center justify-between py-3 px-4 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {title}
        <svg className={`w-4 h-4 transition-transform ${expanded === id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded === id && <div className="px-4 pb-4">{children}</div>}
    </div>
  )

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm text-gray-900">Фильтры</h2>
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={clear} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Сбросить
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section id="price" title="Цена, ₽">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                placeholder="от"
                value={filters.price_min || ''}
                onChange={(e) => set('price_min', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <span className="text-gray-400 self-center">—</span>
            <div className="flex-1">
              <input
                type="number"
                placeholder="до"
                value={filters.price_max || ''}
                onChange={(e) => set('price_max', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </Section>

        <Section id="area" title="Площадь, соток">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                placeholder="от"
                value={filters.area_min !== undefined && filters.area_min !== '' ? String(Number(filters.area_min) / 100) : ''}
                onChange={(e) => set('area_min', e.target.value !== '' ? String(Number(e.target.value) * 100) : '')}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <span className="text-gray-400 self-center">—</span>
            <div className="flex-1">
              <input
                type="number"
                placeholder="до"
                value={filters.area_max !== undefined && filters.area_max !== '' ? String(Number(filters.area_max) / 100) : ''}
                onChange={(e) => set('area_max', e.target.value !== '' ? String(Number(e.target.value) * 100) : '')}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </Section>

        <Section id="vri" title="Вид разрешённого использования">
          <div className="space-y-1.5">
            {PERMITTED_USES.map((u) => (
              <label key={u} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.permitted_use === u}
                  onChange={() => set('permitted_use', filters.permitted_use === u ? '' : u)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{u}</span>
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
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
                  checked={filters.status === s.value}
                  onChange={() => set('status', filters.status === s.value ? '' : s.value)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
