'use client'

import { Check, SlidersHorizontal } from 'lucide-react'
import DraggableMapPanel, { PanelPositionControls } from '@/components/ui/DraggableMapPanel'

interface QuickFiltersProps {
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
}

function QuickFilters({ filters, onChange }: QuickFiltersProps) {
  const toggle = (key: string, value: string, clearKeys: string[] = []) => {
    const next = { ...filters }
    const active = next[key] === value
    for (const clearKey of [key, ...clearKeys]) delete next[clearKey]
    if (!active) next[key] = value
    onChange(next)
  }

  const chips = [
    {
      label: 'Только свободные',
      active: filters.status === 'free',
      onClick: () => toggle('status', 'free'),
    },
    {
      label: 'До 5 млн ₽',
      active: filters.price_max === '5000000',
      onClick: () => toggle('price_max', '5000000'),
    },
    {
      label: '10 соток+',
      active: filters.area_min === '1000',
      onClick: () => toggle('area_min', '1000'),
    },
  ]

  return (
    <DraggableMapPanel
      storageKey="landsearch:panel:quick-filters"
      anchor="bottom-center"
      className="absolute bottom-[calc(var(--result-tray-height)+1rem)] left-2 z-30 max-w-[calc(100%-1rem)] sm:left-1/2"
    >
      {(panelControls) => (
        <div aria-label="Быстрые фильтры" className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-lg border border-gray-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
          <span
            {...panelControls.dragHandleProps}
            className={`hidden shrink-0 items-center gap-1 px-1 text-[10px] font-semibold text-gray-500 sm:inline-flex ${panelControls.canDrag && !panelControls.pinned ? 'cursor-move' : ''}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Быстрый выбор
          </span>
          <PanelPositionControls controls={panelControls} />
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              aria-pressed={chip.active}
              onClick={chip.onClick}
              className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${chip.active ? 'border-[var(--ls-green)] bg-[#e4f1ec] text-[var(--ls-green-dark)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              {chip.active && <Check className="h-3.5 w-3.5" />}
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </DraggableMapPanel>
  )
}

export default QuickFilters
