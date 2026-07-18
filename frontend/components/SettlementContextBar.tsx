'use client'

import { Link2, MapPinned, X } from 'lucide-react'
import type { Settlement } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { useState } from 'react'

interface SettlementContextBarProps {
  settlement: Settlement
  total: number
  onClear: () => void
}

export default function SettlementContextBar({ settlement, total, onClear }: SettlementContextBarProps) {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    const success = await copyText(window.location.href)
    if (!success) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const location = [settlement.region, settlement.district].filter(Boolean).join(' · ')
  const stats = settlement.stats
  const statusTotals = [
    { key: 'free_plots' as const, label: 'свободных', className: 'text-emerald-700' },
    { key: 'reserved_plots' as const, label: 'в резерве', className: 'text-amber-700' },
    { key: 'booked_plots' as const, label: 'забронировано', className: 'text-orange-700' },
    { key: 'sold_plots' as const, label: 'продано', className: 'text-red-700' },
  ]

  return (
    <div
      aria-label="Контекст выбранной территории"
      className="absolute left-1/2 top-3 z-20 flex w-[min(42rem,calc(100%-1rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-[var(--ls-green)]/20 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm sm:top-4 sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <MapPinned className="h-5 w-5 shrink-0 text-[var(--ls-green)]" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ls-green)]">Контекст выбранной территории</p>
          <h2 className="truncate text-xs font-semibold text-gray-900 sm:text-sm">{settlement.name}</h2>
          {location && <p className="truncate text-[10px] text-gray-500 sm:text-xs">{location}</p>}
          {stats && (
            <div className="mt-0.5 hidden flex-wrap gap-x-2 text-[10px] font-medium sm:flex">
              {statusTotals.map((item) => (
                <span key={item.key} className={item.className}>
                  {stats[item.key]} {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="hidden shrink-0 rounded-full bg-[#e4f1ec] px-2 py-1 text-[10px] font-semibold text-[var(--ls-green-dark)] sm:inline-flex">
          {total} участков
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copyLink}
          aria-label="Скопировать ссылку на территорию"
          title={copied ? 'Ссылка скопирована' : 'Скопировать ссылку на территорию'}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)]"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Сбросить территорию"
          title="Сбросить территорию"
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
