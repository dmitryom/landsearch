'use client'

import { useEffect, useRef, useState } from 'react'
import { BarChart3, Check, Copy, ExternalLink, MapPin, X } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS, vriColor } from '@/lib/constants'
import { api } from '@/lib/api'
import DraggableMapPanel, { PanelPositionControls } from '@/components/ui/DraggableMapPanel'
import Link from 'next/link'

type PlotTab = 'overview' | 'cadastre' | 'restrictions' | 'infrastructure' | 'source'

const TABS: Array<{ id: PlotTab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'cadastre', label: 'Кадастр НСПД' },
  { id: 'restrictions', label: 'Ограничения' },
  { id: 'infrastructure', label: 'Инфраструктура' },
  { id: 'source', label: 'Источник' },
]

const SHORT_TAB_LABELS: Record<PlotTab, string> = {
  overview: 'Обзор',
  cadastre: 'Кадастр',
  restrictions: 'Риски',
  infrastructure: 'Инфра',
  source: 'Источник',
}

function money(value: number | undefined | null): string {
  return value == null ? 'Не указана' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
}

function ValueRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="border-b border-[#edf1ed] py-2.5 last:border-0">
      <dt className="text-[11px] text-[var(--ls-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-[var(--ls-ink)]">{value}</dd>
    </div>
  )
}

export default function PlotPopup({ plot, onClose }: { plot: Record<string, any>; onClose: () => void }) {
  const [tab, setTab] = useState<PlotTab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [phone, setPhone] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => { dialogRef.current?.focus() }, [plot.id])

  const handleConsult = async () => {
    if (!phone.trim()) return
    if (!consentGiven) {
      setError('Подтвердите согласие на обработку персональных данных')
      return
    }
    setSending(true)
    setError('')
    try {
      await api.leads.create({
        plot_id: plot.id,
        buyer_phone: phone.trim(),
        buyer_name: '',
        consent_given: true,
        consent_version: '2026-07-20',
      })
      setSent(true)
      setConsentGiven(false)
    } catch {
      setError('Не удалось отправить заявку. Проверьте номер и повторите попытку.')
    } finally {
      setSending(false)
    }
  }

  const copyCadastral = async () => {
    if (!plot.cadastral_number || !navigator.clipboard) return
    await navigator.clipboard.writeText(plot.cadastral_number)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const status = String(plot.status || '')
  const statusColor = STATUS_COLORS[status] || '#6b7280'
  const statusLabel = STATUS_LABELS[status] || 'Статус не указан'
  const permittedUse = plot.permitted_use || plot.use
  const pricePerSotka = plot.price != null && Number(plot.area_m2) > 0 ? plot.price / (plot.area_m2 / 100) : null

  return (
    <DraggableMapPanel
      storageKey="landsearch:panel:plot"
      anchor="top-right"
      className="absolute inset-x-3 bottom-3 z-40 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-[min(25rem,calc(100%-2rem))]"
    >
      {(panelControls) => (
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Карточка участка ${plot.cadastral_number || ''}`}
          tabIndex={-1}
          className="ls-panel max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto sm:max-h-[calc(100vh-2rem)]"
        >
      <div
        {...panelControls.dragHandleProps}
        className={`border-t-4 px-4 pb-3 pt-3 ${panelControls.canDrag && !panelControls.pinned ? 'cursor-move' : ''}`}
        style={{ borderTopColor: statusColor }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ls-muted)]">Земельный участок</p>
            <h2 className="mt-1 break-all font-mono text-sm font-bold text-[var(--ls-blue)]">{plot.cadastral_number || 'Кадастровый номер не указан'}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ls-muted)]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{plot.address || 'Адрес уточняется'}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <PanelPositionControls controls={panelControls} />
            <button type="button" onClick={copyCadastral} aria-label="Скопировать кадастровый номер" title="Скопировать кадастровый номер" className="ls-control grid h-9 w-9 place-items-center">
              {copied ? <Check className="h-4 w-4 text-[var(--ls-green)]" /> : <Copy className="h-4 w-4 text-[var(--ls-muted)]" />}
            </button>
            <button type="button" onClick={onClose} aria-label="Закрыть карточку участка" title="Закрыть карточку участка" className="ls-control grid h-9 w-9 place-items-center">
              <X className="h-4 w-4 text-[var(--ls-muted)]" />
            </button>
          </div>
        </div>
        <span className="ls-status mt-3" style={{ backgroundColor: `${statusColor}22`, color: statusColor }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />{statusLabel}</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-md border border-[var(--ls-line)] bg-[#fbfdfb] p-2"><span className="block text-[10px] text-[var(--ls-muted)]">Площадь</span><strong className="text-sm">{plot.area_m2 ? `${(plot.area_m2 / 100).toFixed(1)} сот.` : '—'}</strong></div>
          <div className="rounded-md border border-[var(--ls-line)] bg-[#fbfdfb] p-2"><span className="block text-[10px] text-[var(--ls-muted)]">Цена</span><strong className="text-sm">{plot.price != null ? money(plot.price) : 'По запросу'}</strong></div>
          <div className="rounded-md border border-[var(--ls-line)] bg-[#fbfdfb] p-2"><span className="block text-[10px] text-[var(--ls-muted)]">Цена за сотку</span><strong className="text-sm">{pricePerSotka != null ? money(pricePerSotka) : '—'}</strong></div>
        </div>
      </div>

      <div role="tablist" aria-label="Подробности участка" className="grid grid-cols-5 gap-1 border-y border-[var(--ls-line)] bg-[#f4f7f4] p-1 sm:flex sm:overflow-x-auto">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-10 rounded-md px-1 text-[10px] font-semibold leading-tight sm:shrink-0 sm:px-2.5 sm:whitespace-nowrap sm:text-[11px] ${tab === item.id ? 'bg-white text-[var(--ls-green-dark)] shadow-sm' : 'text-[var(--ls-muted)] hover:bg-white/70'}`}>
            <span className="sm:hidden">{SHORT_TAB_LABELS[item.id]}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'overview' && (
          <dl>
            <ValueRow label="Местоположение" value={plot.address} />
            <ValueRow label="Разрешённое использование" value={permittedUse ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: vriColor(plot.vri_code || permittedUse) }} />{permittedUse}</span> : undefined} />
            <ValueRow label="Категория земель" value={plot.category} />
            <ValueRow label="Описание" value={plot.description} />
          </dl>
        )}
        {tab === 'cadastre' && (
          <dl>
            <ValueRow label="Кадастровый квартал" value={plot.cad_unit} />
            <ValueRow label="Кадастровая стоимость" value={money(plot.cadastral_value)} />
            <ValueRow label="Вид объекта" value={plot.object_type} />
            <ValueRow label="Вид участка" value={plot.land_plot_type} />
            <ValueRow label="Форма собственности" value={plot.ownership_form} />
            <ValueRow label="Дата регистрации" value={plot.registration_date} />
            <ValueRow label="Геометрия" value={plot.geometry ? 'Полигон получен' : 'Геометрия отсутствует'} />
          </dl>
        )}
        {tab === 'restrictions' && (
          <div className="rounded-md border border-[#e8d9b7] bg-[#fffaf0] p-3 text-sm text-[#765b20]">
            <strong className="block text-[var(--ls-ink)]">Ограничения требуют проверки</strong>
            <span className="mt-1 block text-xs leading-5">Подключённые ограничения и зональные слои отображаются на карте, если доступны из НСПД. Публичные данные не заменяют юридическую проверку.</span>
          </div>
        )}
        {tab === 'infrastructure' && (
          <div className="space-y-2 text-sm text-[var(--ls-muted)]">
            <div className="rounded-md border border-[var(--ls-line)] p-3"><strong className="block text-[var(--ls-ink)]">Карта рядом</strong>Включите дороги, здания и населённые пункты в меню «Слои данных».</div>
            <div className="rounded-md border border-[var(--ls-line)] p-3"><strong className="block text-[var(--ls-ink)]">Адрес</strong>{plot.address || 'Адрес уточняется'}</div>
          </div>
        )}
        {tab === 'source' && (
          <div className="space-y-3">
            <div className="rounded-md border border-[#bad8ca] bg-[#f4fbf7] p-3 text-xs leading-5 text-[var(--ls-muted)]"><strong className="block text-sm text-[var(--ls-green-dark)]">Источник: НСПД</strong>Кадастровые границы и атрибуты получены из Национальной системы пространственных данных. Дата обновления: {plot.updated_at ? new Date(plot.updated_at).toLocaleDateString('ru-RU') : 'не указана'}.</div>
            <a href="https://nspd.gov.ru/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--ls-blue)] hover:underline">Открыть НСПД <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          </div>
        )}

        {plot.settlement_id && (
          <Link href={`/settlements/${plot.settlement_id}`} className="mt-3 flex min-h-11 items-center gap-2 border-t border-[var(--ls-line)] pt-3 text-sm font-semibold text-[var(--ls-blue)] hover:underline"><BarChart3 className="h-4 w-4" aria-hidden="true" /> Анализ поселения</Link>
        )}

        <div className="mt-4 space-y-2 border-t border-[var(--ls-line)] pt-3">
          <a href={`/plots/${plot.id}`} className="flex min-h-11 items-center justify-center rounded-md bg-[var(--ls-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--ls-green-dark)]">Подробнее об участке</a>
          {!showForm && !sent && <button type="button" onClick={() => setShowForm(true)} className="flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--ls-green)] px-3 py-2 text-sm font-semibold text-[var(--ls-green-dark)] hover:bg-[#f0faf5]">Получить консультацию</button>}
          {showForm && !sent && (
            <div className="space-y-2">
              <label htmlFor="plot-phone" className="block text-xs font-semibold text-[var(--ls-ink)]">Телефон для связи</label>
              <input id="plot-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" className="ls-input w-full px-3 py-2 text-sm" aria-describedby="plot-phone-hint" />
              <p id="plot-phone-hint" className="text-[11px] text-[var(--ls-muted)]">Ответим по выбранному участку.</p>
              <label htmlFor="plot-consent" className="flex items-start gap-2 text-[11px] leading-5 text-[var(--ls-muted)]">
                <input id="plot-consent" type="checkbox" checked={consentGiven} onChange={(event) => { setConsentGiven(event.target.checked); setError('') }} className="mt-1 h-4 w-4 shrink-0" />
                <span>Согласен на обработку персональных данных по <a href="/privacy" target="_blank" rel="noreferrer" className="text-[var(--ls-blue)] underline">политике обработки</a>.</span>
              </label>
              <button type="button" onClick={handleConsult} disabled={!phone.trim() || !consentGiven || sending} className="flex min-h-11 w-full items-center justify-center rounded-md bg-[var(--ls-green)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Отправка…' : 'Отправить заявку'}</button>
            </div>
          )}
          {error && <p className="text-sm text-[var(--ls-red)]" role="alert">{error}</p>}
          {sent && <p className="rounded-md bg-[#e4f1ec] p-3 text-center text-sm font-semibold text-[var(--ls-green-dark)]" role="status">Заявка отправлена. Мы свяжемся с вами.</p>}
        </div>
      </div>
        </section>
      )}
    </DraggableMapPanel>
  )
}
