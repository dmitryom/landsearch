'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarClock, Check, Clock3, Search, X } from 'lucide-react'
import { api, type Plot, type ReservationResponse, type ReservationStatus } from '@/lib/api'

const STATUS_LABELS: Record<ReservationStatus, string> = {
  active: 'Активен',
  confirmed: 'Подтвержден',
  cancelled: 'Отменен',
  expired: 'Истек',
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<ReservationResponse[]>([])
  const [plotQuery, setPlotQuery] = useState('')
  const [plotResults, setPlotResults] = useState<Plot[]>([])
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [durationHours, setDurationHours] = useState(24)
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('active')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadReservations = useCallback(async () => {
    setError('')
    try {
      setReservations(await api.reservations.list(statusFilter || undefined))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить бронирования')
    }
  }, [statusFilter])

  useEffect(() => {
    void loadReservations()
  }, [loadReservations])

  const searchPlots = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.plots.list({ query: plotQuery, status: 'free', page_size: '20', include_geometry: 'false' })
      setPlotResults(result.items)
      if (!result.items.length) setMessage('Свободные участки не найдены')
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Поиск участков не выполнен')
    } finally {
      setBusy(false)
    }
  }

  const createReservation = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPlot) {
      setError('Выберите свободный участок')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.reservations.create({
        plot_id: selectedPlot.id,
        buyer_name: buyerName || undefined,
        buyer_phone: buyerPhone || undefined,
        duration_hours: durationHours,
      })
      setSelectedPlot(null)
      setPlotResults([])
      setPlotQuery('')
      setBuyerName('')
      setBuyerPhone('')
      setMessage('Участок забронирован')
      await loadReservations()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось создать резерв')
    } finally {
      setBusy(false)
    }
  }

  const act = async (reservation: ReservationResponse, action: 'extend' | 'confirm' | 'cancel') => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (action === 'extend') await api.reservations.extend(reservation.id, 24)
      if (action === 'confirm') await api.reservations.confirm(reservation.id)
      if (action === 'cancel') await api.reservations.cancel(reservation.id)
      setMessage(action === 'extend' ? 'Резерв продлен на 24 часа' : action === 'confirm' ? 'Бронирование подтверждено' : 'Бронирование отменено')
      await loadReservations()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Операция не выполнена')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--ls-green)]">Продажи</p>
          <h1 className="mt-1 text-2xl font-semibold">Бронирования участков</h1>
          <p className="mt-1 text-sm text-[var(--ls-muted)]">Один активный резерв на участок. Статус карты меняется автоматически.</p>
        </div>
        <label className="text-xs font-medium text-[var(--ls-muted)]">
          Показать
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | '')} className="ml-2 min-h-10 rounded-md border border-[var(--ls-line)] bg-white px-3 text-sm text-[var(--ls-ink)]">
            <option value="active">Активные</option>
            <option value="confirmed">Подтвержденные</option>
            <option value="cancelled">Отмененные</option>
            <option value="expired">Истекшие</option>
            <option value="">Все</option>
          </select>
        </label>
      </header>

      {(message || error) && <p role="status" className={`rounded-md px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-[#e4f1ec] text-[var(--ls-green-dark)]'}`}>{error || message}</p>}

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-lg border border-[var(--ls-line)] bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-5 w-5 text-[var(--ls-green)]" /> Создать резерв</h2>
          <form onSubmit={searchPlots} className="mt-4">
            <label htmlFor="reservation-plot-search" className="text-xs font-medium text-[var(--ls-muted)]">Кадастровый номер, адрес или поселок</label>
            <div className="mt-1 flex gap-2">
              <input id="reservation-plot-search" value={plotQuery} onChange={(event) => setPlotQuery(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm" />
              <button type="submit" disabled={busy} aria-label="Найти свободный участок" className="ls-control grid min-h-10 min-w-10 place-items-center"><Search className="h-4 w-4" /></button>
            </div>
          </form>

          {plotResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto border-y border-[var(--ls-line)]">{plotResults.map((plot) => <button key={plot.id} type="button" onClick={() => setSelectedPlot(plot)} className={`block w-full border-b border-[var(--ls-line)] px-2 py-2 text-left text-xs last:border-0 ${selectedPlot?.id === plot.id ? 'bg-[#e4f1ec]' : 'hover:bg-[var(--ls-paper)]'}`}><strong>{plot.cadastral_number}</strong><span className="mt-0.5 block truncate text-[var(--ls-muted)]">{plot.address || plot.title || 'Адрес не указан'}</span></button>)}</div>}

          <form onSubmit={createReservation} className="mt-4 space-y-3">
            {selectedPlot && <p className="rounded-md bg-[var(--ls-paper)] px-3 py-2 text-xs"><span className="text-[var(--ls-muted)]">Выбран:</span> <strong>{selectedPlot.cadastral_number}</strong></p>}
            <label className="block text-xs font-medium text-[var(--ls-muted)]">Покупатель<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm" /></label>
            <label className="block text-xs font-medium text-[var(--ls-muted)]">Телефон<input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm" /></label>
            <label className="block text-xs font-medium text-[var(--ls-muted)]">Срок, часов<input type="number" min={1} max={720} value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value) || 24)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm" /></label>
            <button type="submit" disabled={busy || !selectedPlot} className="min-h-10 w-full rounded-md bg-[var(--ls-green)] px-3 text-sm font-semibold text-white disabled:opacity-40">Забронировать</button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--ls-line)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[var(--ls-paper)] text-xs text-[var(--ls-muted)]"><tr><th className="px-4 py-3">Участок</th><th className="px-4 py-3">Покупатель</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Действует до</th><th className="px-4 py-3 text-right">Действия</th></tr></thead>
              <tbody>{reservations.map((reservation) => <tr key={reservation.id} className="border-t border-[var(--ls-line)]"><td className="px-4 py-3"><strong>{reservation.plot_cadastral_number || reservation.plot_id}</strong><span className="block text-xs text-[var(--ls-muted)]">{reservation.plot_title}</span></td><td className="px-4 py-3">{reservation.buyer_name || 'Не указан'}<span className="block text-xs text-[var(--ls-muted)]">{reservation.buyer_phone}</span></td><td className="px-4 py-3">{STATUS_LABELS[reservation.status]}</td><td className="px-4 py-3">{formatDate(reservation.expires_at)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => act(reservation, 'extend')} disabled={busy || reservation.status !== 'active'} title="Продлить на 24 часа" aria-label="Продлить" className="ls-control p-2 disabled:opacity-30"><Clock3 className="h-4 w-4" /></button><button type="button" onClick={() => act(reservation, 'confirm')} disabled={busy || reservation.status !== 'active'} title="Подтвердить" aria-label="Подтвердить" className="ls-control p-2 text-[var(--ls-green)] disabled:opacity-30"><Check className="h-4 w-4" /></button><button type="button" onClick={() => act(reservation, 'cancel')} disabled={busy || reservation.status !== 'active'} title="Отменить" aria-label="Отменить" className="ls-control p-2 text-red-600 disabled:opacity-30"><X className="h-4 w-4" /></button></div></td></tr>)}</tbody>
            </table>
            {!reservations.length && <p className="p-8 text-center text-sm text-[var(--ls-muted)]">Бронирований с выбранным статусом нет</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
