'use client'

import { VRI_COLORS } from '@/lib/constants'

export default function VriLegend() {
  const entries = Object.entries(VRI_COLORS).slice(0, 10)
  return (
    <div className="absolute bottom-4 left-2 sm:left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-2 sm:p-3 text-xs sm:text-sm z-10 border max-w-[280px]">
      <div className="text-[10px] font-semibold text-gray-500 mb-1.5">ВРИ</div>
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {entries.map(([code, color]) => (
          <div key={code} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: color }} />
            <span className="text-gray-600 text-[10px] whitespace-nowrap">{code}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
