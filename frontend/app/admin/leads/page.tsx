'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Mail, Phone, RefreshCcw } from 'lucide-react'
import { api, type LeadResponse, type LeadStatus } from '@/lib/api'

const LEAD_STATUSES: Array<{ value: LeadStatus; label: string; className: string }> = [
  { value: 'new', label: 'Новая', className: 'bg-blue-50 text-blue-700' },
  { value: 'in_progress', label: 'В работе', className: 'bg-yellow-50 text-yellow-700' },
  { value: 'closed', label: 'Закрыта', className: 'bg-green-50 text-green-700' },
  { value: 'spam', label: 'Спам', className: 'bg-gray-100 text-gray-600' },
]

const STATUS_BY_VALUE: Record<LeadStatus, { value: LeadStatus; label: string; className: string }> = {
  new: LEAD_STATUSES[0]!,
  in_progress: LEAD_STATUSES[1]!,
  closed: LEAD_STATUSES[2]!,
  spam: LEAD_STATUSES[3]!,
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMoney(value: number | undefined): string {
  if (!value) return 'Цена по запросу'
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadLeads = async () => {
    setLoading(true)
    setError('')
    try {
      setLeads(await api.leads.list())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить заявки')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLeads()
  }, [])

  const totals = useMemo(() => {
    return leads.reduce<Record<LeadStatus, number>>(
      (acc, lead) => {
        acc[lead.status] += 1
        return acc
      },
      { new: 0, in_progress: 0, closed: 0, spam: 0 },
    )
  }, [leads])

  const updateLeadStatus = async (leadId: string, status: LeadStatus) => {
    const previous = leads
    setUpdatingId(leadId)
    setLeads((items) => items.map((lead) => lead.id === leadId ? { ...lead, status } : lead))
    try {
      const updated = await api.leads.update(leadId, { status })
      setLeads((items) => items.map((lead) => lead.id === leadId ? updated : lead))
    } catch (e: unknown) {
      setLeads(previous)
      setError(e instanceof Error ? e.message : 'Не удалось обновить статус')
    }
    setUpdatingId(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-44 animate-pulse rounded bg-gray-200" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md bg-white" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Лиды</h1>
          <p className="text-sm text-gray-500">Заявки покупателей по участкам</p>
        </div>
        <button
          type="button"
          onClick={loadLeads}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Обновить
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LEAD_STATUSES.map((status) => (
          <div key={status.value} className="rounded-md border bg-white p-4">
            <p className="text-sm text-gray-500">{status.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totals[status.value]}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-md border bg-white">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Заявок пока нет</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map((lead) => {
              const status = STATUS_BY_VALUE[lead.status] || STATUS_BY_VALUE.new
              return (
                <article key={lead.id} className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1.1fr_220px]">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(lead.created_at)}</span>
                    </div>
                    <p className="font-medium text-gray-900">
                      {lead.buyer_name || 'Без имени'}
                    </p>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      {lead.buyer_phone && (
                        <a href={`tel:${lead.buyer_phone}`} className="flex items-center gap-2 hover:text-blue-600">
                          <Phone className="h-4 w-4" />
                          {lead.buyer_phone}
                        </a>
                      )}
                      {lead.buyer_email && (
                        <a href={`mailto:${lead.buyer_email}`} className="flex items-center gap-2 hover:text-blue-600">
                          <Mail className="h-4 w-4" />
                          {lead.buyer_email}
                        </a>
                      )}
                    </div>
                    {lead.message && (
                      <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">{lead.message}</p>
                    )}
                  </div>

                  <div className="text-sm">
                    <p className="font-medium text-gray-900">
                      {lead.plot_title || lead.plot_cadastral_number || 'Участок'}
                    </p>
                    {lead.plot_cadastral_number && (
                      <p className="mt-1 font-mono text-xs text-gray-500">{lead.plot_cadastral_number}</p>
                    )}
                    <p className="mt-2 text-gray-600">{formatMoney(lead.plot_price)}</p>
                    <Link
                      href={`/plots/${lead.plot_id}`}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Открыть участок
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <div className="flex flex-col justify-center">
                    <label htmlFor={`lead-status-${lead.id}`} className="mb-1 text-xs font-medium text-gray-500">
                      Статус заявки
                    </label>
                    <select
                      id={`lead-status-${lead.id}`}
                      value={lead.status}
                      disabled={updatingId === lead.id}
                      onChange={(event) => updateLeadStatus(lead.id, event.target.value as LeadStatus)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                    >
                      {LEAD_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
