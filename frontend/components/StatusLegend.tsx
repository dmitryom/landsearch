'use client'

import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'

export default function StatusLegend() {
  return (
    <div aria-label="Легенда статусов участков" className="absolute top-4 left-2 sm:left-4 z-10 max-w-[220px] rounded-lg border bg-white/95 p-2 shadow-lg backdrop-blur-sm sm:p-3">
      <div className="mb-1.5 text-[10px] font-semibold text-gray-500">Статус участка</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: STATUS_COLORS[status] }} />
            <span className="whitespace-nowrap text-[10px] text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
