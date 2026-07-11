'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Scale, Star, X } from 'lucide-react'
import { STATUS_LABELS, vriColor } from '@/lib/constants'
import { safeGet, safeSet } from '@/lib/storage'

const FAVORITES_KEY = 'landsearch:favorites'
const COMPARE_KEY = 'landsearch:compare'
const MAX_COMPARE = 4

interface PlotCardListProps {
  plots: any[]
  total: number
  onSelect: (plot: any) => void
  onFlyTo: (plot: any) => void
}

function formatMoney(value: number | undefined | null): string {
  if (!value) return 'Цена по запросу'
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
}

function readStoredArray<T>(key: string, fallback: T[]): T[] {
  const raw = safeGet(key)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveStoredArray<T>(key: string, value: T[]): void {
  safeSet(key, JSON.stringify(value))
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export default function PlotCardList({ plots, total, onSelect, onFlyTo }: PlotCardListProps) {
  const [open, setOpen] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [comparePlots, setComparePlots] = useState<any[]>([])
  const sliderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFavoriteIds(readStoredArray<string>(FAVORITES_KEY, []))
    setComparePlots(readStoredArray<any>(COMPARE_KEY, []))
  }, [])

  const totalArea = plots.reduce((s: number, p: any) => s + (p.area_m2 || 0), 0)
  const totalPrice = plots.reduce((s: number, p: any) => s + (p.price || 0), 0)

  const toggleFavorite = (plot: any) => {
    setFavoriteIds((current) => {
      const next = current.includes(plot.id)
        ? current.filter((id) => id !== plot.id)
        : [...current, plot.id]
      saveStoredArray(FAVORITES_KEY, next)
      return next
    })
  }

  const toggleCompare = (plot: any) => {
    setComparePlots((current) => {
      const exists = current.some((item) => item.id === plot.id)
      const next = exists
        ? current.filter((item) => item.id !== plot.id)
        : [plot, ...current].slice(0, MAX_COMPARE)
      saveStoredArray(COMPARE_KEY, next)
      return next
    })
  }

  const removeComparePlot = (plotId: string) => {
    setComparePlots((current) => {
      const next = current.filter((item) => item.id !== plotId)
      saveStoredArray(COMPARE_KEY, next)
      return next
    })
  }

  const downloadCompareCsv = () => {
    const header = ['Кадастровый номер', 'Название', 'Статус', 'Площадь, м2', 'Цена', 'ВРИ', 'Категория']
    const rows = comparePlots.map((plot) => [
      plot.cadastral_number,
      plot.title,
      STATUS_LABELS[plot.status] || plot.status,
      plot.area_m2,
      plot.price,
      plot.permitted_use,
      plot.category,
    ])
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'landsearch-compare.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (plots.length === 0) return null

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-10 border-t bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}
      style={{ maxHeight: open ? '68vh' : '55vh' }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Свернуть список участков' : 'Развернуть список участков'}
        title={open ? 'Свернуть список участков' : 'Развернуть список участков'}
        className="flex w-full cursor-pointer items-center justify-center gap-2 border-b py-3 hover:bg-gray-50"
      >
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </button>

      <div className="flex items-center justify-between px-4 pb-2">
        <h3 className="text-xs font-semibold sm:text-sm">
          Участки <span className="font-normal text-gray-400">({total})</span>
        </h3>
        <div className="flex gap-2 text-[10px] text-gray-500 sm:text-xs">
          <span>Показано {plots.length} из {total}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Избранное {favoriteIds.length}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Сравнение {comparePlots.length}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{(totalArea / 10000).toFixed(1)} га</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</span>
        </div>
      </div>

      {open && comparePlots.length > 0 && (
        <div className="mx-4 mb-3 rounded-md border border-blue-100 bg-blue-50/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">Сравнение участков</p>
            <button
              type="button"
              onClick={downloadCompareCsv}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {comparePlots.map((plot) => (
              <div key={plot.id} className="rounded-md border bg-white p-2 text-xs">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900">{plot.title || plot.cadastral_number}</p>
                  <button
                    type="button"
                    onClick={() => removeComparePlot(plot.id)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    title="Убрать из сравнения"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-mono text-[10px] text-gray-500">{plot.cadastral_number}</p>
                <p className="mt-1">{plot.area_m2 ? `${(plot.area_m2 / 100).toFixed(1)} сот.` : 'Площадь не указана'}</p>
                <p className="font-semibold">{formatMoney(plot.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={sliderRef} className="overflow-x-auto overflow-y-hidden px-4 pb-4">
        <div className="flex gap-3" style={{ width: 'max-content' }}>
          {plots.map((p: any) => {
            const favorite = favoriteIds.includes(p.id)
            const inCompare = comparePlots.some((item) => item.id === p.id)
            return (
              <div
                key={p.id}
                className="w-56 shrink-0 cursor-pointer rounded-md border bg-white transition-shadow hover:shadow-lg sm:w-64"
                onClick={() => { onSelect(p); onFlyTo(p) }}
              >
                <div className="p-3">
                  <div className="mb-1.5 flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold sm:text-sm">{p.title || p.cadastral_number}</p>
                      <p className="truncate font-mono text-[10px] text-gray-400 sm:text-xs">{p.cadastral_number}</p>
                    </div>
                    <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      p.status === 'free' ? 'bg-green-100 text-green-700' :
                      p.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' :
                      p.status === 'booked' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>{STATUS_LABELS[p.status]}</span>
                  </div>

                  {p.address && <p className="mb-1.5 truncate text-[10px] text-gray-500 sm:text-xs">{p.address}</p>}

                  <div className="mb-2 flex items-center gap-2 text-[10px] text-gray-500 sm:text-xs">
                    {p.area_m2 && <span>{(p.area_m2 / 100).toFixed(1)} сот.</span>}
                    {p.permitted_use && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1 truncate">
                          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: vriColor(p.permitted_use) }} />
                          {p.permitted_use}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-gray-900 sm:text-base">
                      {formatMoney(p.price)}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p) }}
                        className={`rounded-md border p-1.5 ${favorite ? 'border-yellow-200 bg-yellow-50 text-yellow-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        title={favorite ? 'Убрать из избранного' : 'В избранное'}
                      >
                        <Star className="h-3.5 w-3.5" fill={favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleCompare(p) }}
                        className={`rounded-md border p-1.5 ${inCompare ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        title={inCompare ? 'Убрать из сравнения' : 'Сравнить'}
                      >
                        <Scale className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <a
                    href={`/plots/${p.id}`}
                    className="mt-2 inline-flex text-[10px] font-medium text-blue-600 hover:text-blue-700 sm:text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Подробнее →
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
