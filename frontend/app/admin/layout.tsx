'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, X, LogOut, LayoutDashboard, MapPinned, Inbox, Upload, Settings2 } from 'lucide-react'
import { safeGet, safeRemove } from '@/lib/storage'

const NAV_ITEMS = [
  { key: '/admin', label: 'Дашборд' },
  { key: '/admin/plots', label: 'Участки' },
  { key: '/admin/settlements', label: 'Границы' },
  { key: '/admin/leads', label: 'Лиды' },
  { key: '/admin/import', label: 'Импорт' },
  { key: '/admin/settings', label: 'Настройки' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navIcons = {
    '/admin': LayoutDashboard,
    '/admin/plots': MapPinned,
    '/admin/settlements': MapPinned,
    '/admin/leads': Inbox,
    '/admin/import': Upload,
    '/admin/settings': Settings2,
  }

  useEffect(() => {
    const token = safeGet('token')
    if (!token) {
      router.push('/auth/login')
      return
    }
    const tokenPayload = token.split('.')[1]
    if (tokenPayload) {
      try {
        const decoded = JSON.parse(atob(tokenPayload))
        if (decoded.exp * 1000 < Date.now()) {
          safeRemove('token')
          router.push('/auth/login')
          return
        }
      } catch {}
    }
    import('@/lib/api').then(({ api }) => {
      api.auth.me()
        .then(setUser)
        .catch(() => {
          safeRemove('token')
          router.push('/auth/login')
        })
        .finally(() => setLoading(false))
    })
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ls-paper)] text-[var(--ls-ink)] md:flex">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Закрыть навигацию"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[var(--ls-line)] bg-[var(--ls-surface)] p-4 shadow-xl transition-transform md:relative md:z-auto md:translate-x-0 md:shadow-none ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-7 flex items-center justify-between">
          <Link href="/admin" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-2 text-lg font-bold text-[var(--ls-ink)]">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--ls-green)] text-sm font-bold text-white">L</span>
            LandSearch
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть навигацию"
            className="rounded-md p-1.5 text-[var(--ls-muted)] hover:bg-[var(--ls-paper)] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Навигация админки" className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.key}
              onClick={() => setMobileNavOpen(false)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                pathname === item.key
                  ? 'bg-[#e4f1ec] text-[var(--ls-green-dark)]'
                  : 'text-[var(--ls-muted)] hover:bg-[var(--ls-paper)] hover:text-[var(--ls-ink)]'
              }`}
            >
              {(() => { const Icon = navIcons[item.key as keyof typeof navIcons]; return <Icon aria-hidden="true" className="h-4 w-4" /> })()}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[var(--ls-line)] pt-4">
          <p className="truncate text-sm text-[var(--ls-muted)]">{user?.email}</p>
          <button
            onClick={() => { safeRemove('token'); router.push('/auth/login') }}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ls-red)] hover:underline"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-[var(--ls-line)] bg-[var(--ls-surface)] px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">Рабочая область</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Открыть навигацию"
            className="ls-control min-h-11 min-w-11 p-2 text-[var(--ls-muted)]"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="min-h-screen overflow-y-auto bg-[var(--ls-paper)] p-4 sm:p-6">
        {children}
        </main>
      </div>
    </div>
  )
}
