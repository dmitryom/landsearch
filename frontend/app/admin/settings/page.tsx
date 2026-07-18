'use client'

export default function AdminSettingsPage() {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">Рабочая область</p>
      <h2 className="mb-4 text-2xl font-bold text-[var(--ls-ink)]">Настройки</h2>
      <div className="rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] p-6 shadow-sm">
        <p className="text-[var(--ls-muted)]">Настройки тенанта будут здесь.</p>
      </div>
    </div>
  )
}
