'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, EyeOff, GripVertical, Maximize2, Minimize2, PanelBottom, Scale, Star, X } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS, vriColor } from '@/lib/constants'
import { safeGet, safeSet } from '@/lib/storage'
import ResizeHandle from '@/components/ui/ResizeHandle'
import DraggableMapPanel, { PanelPositionControls } from '@/components/ui/DraggableMapPanel'

const FAVORITES_KEY = 'landsearch:favorites'
const COMPARE_KEY = 'landsearch:compare'
const MAX_COMPARE = 4

interface PlotCardListProps {
  plots: any[]
  total: number
  onSelect: (plot: any) => void
  onHover?: (plot: any) => void
  onFlyTo: (plot: any) => void
  height?: number
  onHeightChange?: (height: number) => void
  selectedPlotId?: string
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

export default function PlotCardList({ plots, total, onSelect, onHover, onFlyTo, height = 248, onHeightChange, selectedPlotId }: PlotCardListProps) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [maximized, setMaximized] = useState(false)
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

  const showTray = () => {
    setHidden(false)
    setOpen(false)
    setMaximized(false)
  }

  const hideTray = () => {
    setHidden(true)
    setOpen(false)
    setMaximized(false)
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={showTray}
        aria-label="Показать список участков"
        title="Показать список участков"
        className="absolute bottom-3 left-3 right-3 z-30 flex h-11 items-center justify-between rounded-xl border border-gray-200 bg-white/95 px-3 text-left text-xs font-semibold text-gray-700 shadow-xl backdrop-blur-sm hover:bg-white sm:bottom-4 sm:left-auto sm:right-4 sm:w-[min(680px,calc(100%-2rem))]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <PanelBottom className="h-4 w-4 shrink-0 text-[var(--ls-green)]" />
          <span className="truncate">Участки ({total})</span>
        </span>
        <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
    )
  }

  return (
    <DraggableMapPanel
      storageKey="landsearch:panel:results"
      anchor="bottom-right"
      disabled={maximized}
      className="absolute bottom-3 left-3 right-3 z-30 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[min(680px,calc(100%-2rem))]"
    >
      {(panelControls) => (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl transition-[height] duration-300 ease-out"
      style={{
        height: maximized ? 'calc(100vh - 32px)' : open ? `${height}px` : '48px',
        maxHeight: maximized ? 'calc(100vh - 32px)' : '72vh',
      }}
    >
      {open && !maximized && onHeightChange && (
        <ResizeHandle
          axis="y"
          value={height}
          min={176}
          max={680}
          label="Высота панели результатов"
          onChange={onHeightChange}
        />
      )}
      <div className="flex h-12 items-center gap-2 border-b border-gray-100 px-3">
        <span
          {...panelControls.dragHandleProps}
          className={`hidden h-8 w-6 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 md:grid ${panelControls.canDrag && !panelControls.pinned ? 'cursor-move' : ''}`}
          title={panelControls.pinned ? 'Сначала открепите панель' : 'Переместить панель'}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? 'Свернуть список участков' : 'Развернуть список участков'}
          title={open ? 'Свернуть список участков' : 'Развернуть список участков'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)]"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />}
          <span className="truncate text-xs font-semibold sm:text-sm">
            Участки <span className="font-normal text-gray-400">({total})</span>
          </span>
          <span className="hidden truncate text-[10px] text-gray-500 md:inline sm:text-xs">Показано {plots.length} из {total}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <PanelPositionControls controls={panelControls} />
          <button
            type="button"
            onClick={() => { setMaximized((current) => !current); setOpen(true) }}
            aria-label={maximized ? 'Вернуть размер списка участков' : 'Максимальный размер списка участков'}
            title={maximized ? 'Вернуть размер списка участков' : 'Максимальный размер списка участков'}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)]"
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={hideTray}
            aria-label="Скрыть список участков"
            title="Скрыть список участков"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)]"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap gap-x-2 gap-y-1 px-4 py-2 text-[10px] text-gray-500 sm:text-xs">
            <span>Избранное {favoriteIds.length}</span>
            <span>·</span>
            <span>Сравнение {comparePlots.length}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{(totalArea / 10000).toFixed(1)} га</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</span>
          </div>

          {comparePlots.length > 0 && (
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
                role="option"
                tabIndex={0}
                aria-selected={selectedPlotId === p.id}
                aria-label={`${p.title || p.cadastral_number}, ${STATUS_LABELS[p.status] || 'статус не указан'}`}
                data-plot-id={p.id}
                className={`w-56 shrink-0 cursor-pointer rounded-md border bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--ls-blue)] sm:w-64 ${selectedPlotId === p.id ? 'border-[var(--ls-blue)] ring-2 ring-blue-100' : 'border-[var(--ls-line)]'}`}
                onMouseEnter={() => onHover?.(p)}
                onFocus={() => onHover?.(p)}
                onClick={() => { onSelect(p); onFlyTo(p) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(p)
                    onFlyTo(p)
                  }
                }}
              >
                <div className="p-3">
                  <div className="mb-1.5 flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold sm:text-sm">{p.title || p.cadastral_number}</p>
                      <p className="truncate font-mono text-[10px] text-gray-400 sm:text-xs">{p.cadastral_number}</p>
                    </div>
                    <span className="ls-status ml-2 shrink-0" style={{ backgroundColor: `${STATUS_COLORS[p.status] || '#6b7280'}22`, color: STATUS_COLORS[p.status] || '#4b5563' }}>{STATUS_LABELS[p.status] || 'Не указан'}</span>
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
        </>
      )}
    </div>
      )}
    </DraggableMapPanel>
  )
}
