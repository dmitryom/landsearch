'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { RefreshCcw, RotateCcw, Save, Webhook } from 'lucide-react'
import { api, type LegalProfile, type WebhookDeliveryResponse } from '@/lib/api'
import LegalProfileTemplate from '@/components/admin/LegalProfileTemplate'

const EMPTY_LEGAL_PROFILE: LegalProfile = {
  operator_name: '',
  legal_form: '',
  inn: '',
  ogrn: '',
  address: '',
  email: '',
  phone: '',
  rkn_registry_number: '',
  rkn_registry_url: '',
  rkn_exemption_reason: '',
  policy_effective_date: '',
  lead_retention_days: 365,
  reservation_retention_days: 365,
  is_complete: false,
}

export default function AdminSettingsPage() {
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [deliveries, setDeliveries] = useState<WebhookDeliveryResponse[]>([])
  const [legalProfile, setLegalProfile] = useState<LegalProfile>(EMPTY_LEGAL_PROFILE)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [config, rows, legal] = await Promise.all([api.webhook.get(), api.webhook.deliveries(), api.legal.get()])
      setUrl(config.url || '')
      setEnabled(config.enabled)
      setHasSecret(config.has_secret)
      setDeliveries(rows)
      setLegalProfile({ ...EMPTY_LEGAL_PROFILE, ...legal })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить настройки')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const config = await api.webhook.update({ url, secret: secret || undefined, enabled })
      setSecret('')
      setHasSecret(config.has_secret)
      setMessage('Webhook сохранен')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить webhook')
    } finally {
      setBusy(false)
    }
  }

  const processDeliveries = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.webhook.process()
      setMessage(`Обработано событий: ${result.processed}`)
      await load()
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Не удалось обработать очередь')
    } finally {
      setBusy(false)
    }
  }

  const saveLegalProfile = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await api.legal.update({
        operator_name: legalProfile.operator_name || null,
        legal_form: legalProfile.legal_form || null,
        inn: legalProfile.inn || null,
        ogrn: legalProfile.ogrn || null,
        address: legalProfile.address || null,
        email: legalProfile.email || null,
        phone: legalProfile.phone || null,
        rkn_registry_number: legalProfile.rkn_registry_number || null,
        rkn_registry_url: legalProfile.rkn_registry_url || null,
        rkn_exemption_reason: legalProfile.rkn_exemption_reason || null,
        policy_effective_date: legalProfile.policy_effective_date || null,
        lead_retention_days: Number(legalProfile.lead_retention_days) || 365,
        reservation_retention_days: Number(legalProfile.reservation_retention_days) || 365,
      })
      setLegalProfile({ ...EMPTY_LEGAL_PROFILE, ...saved })
      setMessage('Реквизиты оператора сохранены')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить реквизиты оператора')
    } finally {
      setBusy(false)
    }
  }

  const updateLegal = (field: keyof LegalProfile, value: string | number) => {
    setLegalProfile((current) => ({ ...current, [field]: value }))
  }

  const retry = async (id: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.webhook.retry(id)
      const result = await api.webhook.process()
      setMessage(`Обработано событий: ${result.processed}`)
      await load()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Повтор не выполнен')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header><p className="text-xs font-semibold uppercase text-[var(--ls-green)]">Интеграции</p><h1 className="mt-1 text-2xl font-semibold">Настройки</h1></header>
      {(message || error) && <p role="status" className={`rounded-md px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-[#e4f1ec] text-[var(--ls-green-dark)]'}`}>{error || message}</p>}
      <form onSubmit={saveLegalProfile} className="rounded-lg border border-[var(--ls-line)] bg-[var(--ls-surface)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Оператор и политика ПДн</h2><p className="mt-1 max-w-3xl text-sm text-[var(--ls-muted)]">Заполните фактические реквизиты владельца сайта. Они будут показаны на странице «Оператор» и использованы для сроков хранения заявок.</p></div>
          <span className={`ls-status ${legalProfile.is_complete ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]' : 'bg-amber-50 text-amber-800'}`}>{legalProfile.is_complete ? 'Профиль заполнен' : 'Требует заполнения'}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Наименование оператора<input value={legalProfile.operator_name || ''} onChange={(event) => updateLegal('operator_name', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={500} /></label>
          <label className="block text-sm font-medium">Организационно-правовая форма<input value={legalProfile.legal_form || ''} onChange={(event) => updateLegal('legal_form', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={255} /></label>
          <label className="block text-sm font-medium">ИНН<input inputMode="numeric" value={legalProfile.inn || ''} onChange={(event) => updateLegal('inn', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={12} /></label>
          <label className="block text-sm font-medium">ОГРН / ОГРНИП<input inputMode="numeric" value={legalProfile.ogrn || ''} onChange={(event) => updateLegal('ogrn', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={15} /></label>
          <label className="block text-sm font-medium md:col-span-2">Юридический / почтовый адрес<input value={legalProfile.address || ''} onChange={(event) => updateLegal('address', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={1000} /></label>
          <label className="block text-sm font-medium">Электронная почта для обращений<input type="email" value={legalProfile.email || ''} onChange={(event) => updateLegal('email', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium">Телефон для обращений<input type="tel" value={legalProfile.phone || ''} onChange={(event) => updateLegal('phone', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium">Номер в реестре Роскомнадзора<input value={legalProfile.rkn_registry_number || ''} onChange={(event) => updateLegal('rkn_registry_number', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium">Ссылка на запись в реестре<input type="url" value={legalProfile.rkn_registry_url || ''} onChange={(event) => updateLegal('rkn_registry_url', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium md:col-span-2">Причина освобождения от уведомления, если применимо<textarea value={legalProfile.rkn_exemption_reason || ''} onChange={(event) => updateLegal('rkn_exemption_reason', event.target.value)} className="mt-1 min-h-20 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" maxLength={2000} /></label>
          <label className="block text-sm font-medium">Дата политики<input type="date" value={legalProfile.policy_effective_date || ''} onChange={(event) => updateLegal('policy_effective_date', event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium">Срок хранения заявок, дней<input type="number" min={1} max={3650} value={legalProfile.lead_retention_days} onChange={(event) => updateLegal('lead_retention_days', Number(event.target.value))} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
          <label className="block text-sm font-medium">Срок хранения бронирований, дней<input type="number" min={1} max={3650} value={legalProfile.reservation_retention_days} onChange={(event) => updateLegal('reservation_retention_days', Number(event.target.value))} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--ls-muted)]">Если оператор освобожден от уведомления, заполните причину вместо номера реестра. Тексты документов требуют проверки юристом.</p>
        <button type="submit" disabled={busy} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--ls-green)] px-4 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" /> Сохранить реквизиты</button>
      </form>
      <LegalProfileTemplate />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={save} className="rounded-lg border border-[var(--ls-line)] bg-[var(--ls-surface)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Webhook className="h-5 w-5 text-[var(--ls-green)]" /> Webhook CRM</h2>
          <p className="mt-1 text-sm text-[var(--ls-muted)]">События заявок и бронирований для amoCRM, Bitrix24 или собственного обработчика.</p>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium">HTTPS URL<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://crm.example.ru/landsearch" className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /></label>
            <label className="block text-sm font-medium">Секрет подписи<input type="password" required={!hasSecret} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={hasSecret ? 'Оставьте пустым, чтобы сохранить текущий' : 'Минимум 16 символов'} className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2" /><span className="mt-1 block text-xs text-[var(--ls-muted)]">Секрет не отображается и хранится в зашифрованном виде.</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-[var(--ls-green)]" /> Отправлять события</label>
          </div>
          <button type="submit" disabled={busy} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--ls-green)] px-4 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" /> Сохранить</button>
        </form>
        <aside className="rounded-lg border border-[var(--ls-line)] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Формат подписи</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--ls-muted)]">Заголовок <code>X-LandSearch-Signature</code> содержит HMAC-SHA256 от точного тела запроса. Повторные события имеют тот же <code>event_id</code>.</p>
          <button type="button" onClick={() => void processDeliveries()} disabled={busy} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--ls-line)] text-sm font-medium disabled:opacity-40"><RefreshCcw className="h-4 w-4" /> Обработать очередь</button>
        </aside>
      </section>
      <section className="overflow-hidden rounded-lg border border-[var(--ls-line)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--ls-line)] px-4 py-3"><h2 className="font-semibold">Доставки событий</h2><button type="button" onClick={() => void load()} aria-label="Обновить доставки" className="ls-control p-2"><RefreshCcw className="h-4 w-4" /></button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[var(--ls-paper)] text-xs text-[var(--ls-muted)]"><tr><th className="px-4 py-3">Событие</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Попытки</th><th className="px-4 py-3">Ответ</th><th className="px-4 py-3"></th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id} className="border-t border-[var(--ls-line)]"><td className="px-4 py-3">{row.event_type}<span className="block font-mono text-[10px] text-[var(--ls-muted)]">{row.event_id}</span></td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.attempts}</td><td className="px-4 py-3">{row.last_http_status || row.last_error_code || '—'}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void retry(row.id)} disabled={busy || row.status === 'delivered'} title="Повторить доставку" aria-label="Повторить доставку" className="ls-control p-2 disabled:opacity-30"><RotateCcw className="h-4 w-4" /></button></td></tr>)}</tbody></table>{!deliveries.length && <p className="p-8 text-center text-sm text-[var(--ls-muted)]">Событий для отправки пока нет</p>}</div>
      </section>
    </div>
  )
}
