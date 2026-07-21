'use client'

import { Copy, FileText } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/lib/clipboard'

export const LEGAL_PROFILE_TEMPLATE = `Наименование оператора: [ООО «Название компании» / ИП ФИО]

Организационно-правовая форма: [ООО / ИП / физическое лицо]

ИНН: [ИНН]

ОГРН / ОГРНИП: [ОГРН или ОГРНИП]

Юридический / почтовый адрес: [полный адрес]

Электронная почта для обращений: [email@example.ru]

Телефон для обращений: [+7 (___) ___-__-__]

Номер в реестре Роскомнадзора: [номер записи]

Ссылка на запись в реестре Роскомнадзора: [https://pd.rkn.gov.ru/...]

Причина освобождения от уведомления: [заполняется только если уведомление не требуется]

Дата вступления политики в силу: [ГГГГ-ММ-ДД]

Срок хранения заявок, дней: [365]

Срок хранения бронирований, дней: [365]`

export default function LegalProfileTemplate() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyText(LEGAL_PROFILE_TEMPLATE)
    if (!success) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section aria-labelledby="legal-profile-template-title" className="rounded-lg border border-dashed border-[var(--ls-green)]/40 bg-[#f5faf7] p-5">
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ls-green)]" />
        <div className="min-w-0">
          <h2 id="legal-profile-template-title" className="text-base font-semibold">Шаблон реквизитов оператора</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--ls-muted)]">Скопируйте текст, замените значения в квадратных скобках и перенесите данные в поля выше. Шаблон не сохраняет данные автоматически.</p>
        </div>
      </div>
      <pre aria-label="Шаблон реквизитов оператора" className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--ls-line)] bg-white p-3 text-xs leading-5 text-[var(--ls-ink)]">{LEGAL_PROFILE_TEMPLATE}</pre>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label="Скопировать шаблон реквизитов оператора"
          title="Скопировать шаблон реквизитов оператора"
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--ls-green)] px-4 text-sm font-semibold text-white hover:bg-[var(--ls-green-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ls-green)] focus-visible:ring-offset-2"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          {copied ? 'Шаблон скопирован' : 'Скопировать шаблон'}
        </button>
        <span role="status" aria-live="polite" className="text-xs text-[var(--ls-muted)]">{copied ? 'Теперь замените значения в квадратных скобках.' : 'Не сохраняйте плейсхолдеры как реальные реквизиты.'}</span>
      </div>
    </section>
  )
}
