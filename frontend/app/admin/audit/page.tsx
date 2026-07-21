'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, RefreshCcw } from 'lucide-react'
import { api, type AuditEventResponse } from '@/lib/api'

const ACTION_LABELS: Record<string, string> = {
  'lead.created': 'Создана заявка',
  'lead.status_changed': 'Изменен статус заявки',
  'reservation.created': 'Создан резерв',
  'reservation.confirmed': 'Резерв подтвержден',
  'reservation.cancelled': 'Резерв отменен',
  'reservation.expired': 'Резерв истек',
  'reservation.extended': 'Резерв продлен',
  'settlement.nspd_imported': 'Импортированы участки NSPD',
  'settlement.published': 'Карта поселка опубликована',
  'settlement.unpublished': 'Карта поселка снята с публикации',
  'plot.created': 'Создан участок',
  'plot.updated': 'Изменен участок',
  'plot.bulk_status_changed': 'Массово изменен статус',
  'plot.archived': 'Участок архивирован',
  'plot.bulk_archived': 'Участки архивированы',
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEventResponse[]>([])
  const [entityType, setEntityType] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setEvents(await api.audit.list(entityType || undefined))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить журнал')
    } finally {
      setLoading(false)
    }
  }, [entityType])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-[var(--ls-green)]">Контроль</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><History className="h-6 w-6" /> Журнал действий</h1><p className="mt-1 text-sm text-[var(--ls-muted)]">Изменения участков, заявок, резервов и импорта внутри организации.</p></div>
        <div className="flex gap-2"><label className="text-xs text-[var(--ls-muted)]">Объект<select value={entityType} onChange={(event) => setEntityType(event.target.value)} className="ml-2 min-h-10 rounded-md border border-[var(--ls-line)] bg-white px-3 text-sm text-[var(--ls-ink)]"><option value="">Все</option><option value="plot">Участки</option><option value="lead">Заявки</option><option value="reservation">Бронирования</option><option value="settlement">Поселки</option></select></label><button type="button" onClick={() => void load()} aria-label="Обновить журнал" className="ls-control grid min-h-10 min-w-10 place-items-center"><RefreshCcw className="h-4 w-4" /></button></div>
      </header>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <section className="overflow-hidden rounded-lg border border-[var(--ls-line)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--ls-paper)] text-xs text-[var(--ls-muted)]"><tr><th className="px-4 py-3">Время</th><th className="px-4 py-3">Действие</th><th className="px-4 py-3">Объект</th><th className="px-4 py-3">Детали</th><th className="px-4 py-3">Пользователь</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-t border-[var(--ls-line)]"><td className="whitespace-nowrap px-4 py-3 text-xs">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(event.created_at))}</td><td className="px-4 py-3 font-medium">{ACTION_LABELS[event.action] || event.action}</td><td className="px-4 py-3"><span className="text-xs text-[var(--ls-muted)]">{event.entity_type}</span><span className="block max-w-48 truncate font-mono text-xs">{event.entity_id}</span></td><td className="max-w-md px-4 py-3 text-xs text-[var(--ls-muted)]">{Object.entries(event.details).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || 'Нет деталей'}</td><td className="px-4 py-3 font-mono text-xs text-[var(--ls-muted)]">{event.actor_id || 'Публичный пользователь'}</td></tr>)}</tbody></table>
          {!loading && events.length === 0 && <p className="p-8 text-center text-sm text-[var(--ls-muted)]">Событий пока нет</p>}
          {loading && <p className="p-8 text-center text-sm text-[var(--ls-muted)]">Загрузка...</p>}
        </div>
      </section>
    </div>
  )
}
