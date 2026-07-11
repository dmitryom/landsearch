'use client'

import { useState, useRef } from 'react'
import { STATUS_LABELS, vriColor } from '@/lib/constants'

interface PlotCardListProps {
  plots: any[]
  total: number
  onSelect: (plot: any) => void
  onFlyTo: (plot: any) => void
}

export default function PlotCardList({ plots, total, onSelect, onFlyTo }: PlotCardListProps) {
  const [open, setOpen] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  const totalArea = plots.reduce((s: number, p: any) => s + (p.area_m2 || 0), 0)
  const totalPrice = plots.reduce((s: number, p: any) => s + (p.price || 0), 0)

  if (plots.length === 0) return null

  return (
    <div
      className={`absolute left-0 right-0 bottom-0 z-10 bg-white border-t shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}
      style={{ maxHeight: '55vh' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 py-3 border-b cursor-pointer hover:bg-gray-50"
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </button>
      <div className="px-4 pb-2 flex items-center justify-between">
        <h3 className="font-semibold text-xs sm:text-sm">
          Участки <span className="text-gray-400 font-normal">({total})</span>
        </h3>
        <div className="flex gap-2 text-[10px] sm:text-xs text-gray-500">
          <span>Показано {plots.length} из {total}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{(totalArea / 10000).toFixed(1)} га</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</span>
        </div>
      </div>
      <div ref={sliderRef} className="overflow-x-auto overflow-y-hidden pb-4 px-4">
        <div className="flex gap-3" style={{ width: 'max-content' }}>
          {plots.map((p: any) => (
            <div
              key={p.id}
              className="w-56 sm:w-64 shrink-0 bg-white rounded-xl border hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => { onSelect(p); onFlyTo(p) }}
            >
              <div className="p-3">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm truncate">{p.title || p.cadastral_number}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400 font-mono truncate">{p.cadastral_number}</p>
                  </div>
                  <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    p.status === 'free' ? 'bg-green-100 text-green-700' :
                    p.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' :
                    p.status === 'booked' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>{STATUS_LABELS[p.status]}</span>
                </div>
                {p.address && <p className="text-[10px] sm:text-xs text-gray-500 truncate mb-1.5">{p.address}</p>}
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 mb-2">
                  {p.area_m2 && <span>{(p.area_m2 / 100).toFixed(1)} сот.</span>}
                  {p.permitted_use && <><span>·</span><span className="truncate flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: vriColor(p.permitted_use) }} />{p.permitted_use}</span></>}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm sm:text-base font-bold text-gray-900">
                    {p.price ? `${new Intl.NumberFormat('ru-RU').format(p.price)} ₽` : '—'}
                  </p>
                  <a href={`/plots/${p.id}`} className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={(e) => e.stopPropagation()}>
                    Подробнее →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
