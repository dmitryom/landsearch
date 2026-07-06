'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { safeGet, safeRemove } from '@/lib/storage'

const NAV_ITEMS = [
  { key: '/admin', label: 'Дашборд' },
  { key: '/admin/plots', label: 'Участки' },
  { key: '/admin/import', label: 'Импорт' },
  { key: '/admin/settings', label: 'Настройки' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col shrink-0">
        <Link href="/admin" className="text-lg font-bold mb-6 block">LandSearch Admin</Link>
        <nav className="space-y-2 flex-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.key}
              className={`block w-full text-left px-3 py-2 rounded text-sm ${
                pathname === item.key ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 truncate">{user?.email}</p>
          <button
            onClick={() => { safeRemove('token'); router.push('/auth/login') }}
            className="text-sm text-red-400 hover:text-red-300 mt-1"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {children}
      </main>
    </div>
  )
}
