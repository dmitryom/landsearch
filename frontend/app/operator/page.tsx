'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, type LegalProfile } from '@/lib/api'

export default function OperatorPage() {
  const [profile, setProfile] = useState<LegalProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.legal.public().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-[var(--ls-paper)] px-4 py-10 text-[var(--ls-ink)] sm:px-6">
      <article className="mx-auto max-w-3xl rounded-lg border border-[var(--ls-line)] bg-[var(--ls-surface)] p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-[var(--ls-blue)] hover:underline">На карту</Link>
        <h1 className="mt-6 text-2xl font-bold">Оператор персональных данных</h1>
        {loading ? <p className="mt-6 text-sm text-[var(--ls-muted)]">Загрузка сведений…</p> : profile?.is_complete ? (
          <dl className="mt-8 divide-y divide-[var(--ls-line)] text-sm">
            {[
              ['Наименование', profile.operator_name],
              ['Организационно-правовая форма', profile.legal_form],
              ['ИНН', profile.inn],
              ['ОГРН/ОГРНИП', profile.ogrn],
              ['Адрес', profile.address],
              ['Электронная почта', profile.email],
              ['Телефон', profile.phone],
              ['Номер в реестре Роскомнадзора', profile.rkn_registry_number],
              ['Основание освобождения от уведомления', profile.rkn_exemption_reason],
              ['Дата политики', profile.policy_effective_date],
            ].map(([label, value]) => value ? <div key={label} className="grid gap-1 py-3 sm:grid-cols-[240px_1fr]"><dt className="text-[var(--ls-muted)]">{label}</dt><dd className="break-words font-medium">{value}</dd></div> : null)}
            {profile.rkn_registry_url && <div className="py-3"><a href={profile.rkn_registry_url} target="_blank" rel="noreferrer" className="text-[var(--ls-blue)] underline">Открыть запись в реестре Роскомнадзора</a></div>}
          </dl>
        ) : <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Сведения об операторе еще не заполнены владельцем сайта. До их публикации не следует запускать сбор заявок и регистрацию пользователей в production.</div>}
        <div className="mt-8 border-t border-[var(--ls-line)] pt-5 text-sm"><Link href="/privacy" className="text-[var(--ls-blue)] underline">Политика обработки персональных данных</Link><span className="mx-2 text-[var(--ls-muted)]">·</span><Link href="/terms" className="text-[var(--ls-blue)] underline">Пользовательское соглашение</Link></div>
      </article>
    </main>
  )
}
