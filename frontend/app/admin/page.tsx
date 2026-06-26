'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, Plot, PlotListResponse } from '@/lib/api'

const PAGE_SIZE = 20

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [plots, setPlots] = useState<Plot[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const loadPlots = useCallback(async (p: number) => {
    try {
      const res = await api.plots.list({ page: String(p), page_size: String(PAGE_SIZE) })
      setPlots(res.items)
      setTotal(res.total)
    } catch {}
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/auth/login')
      return
    }
    Promise.all([api.auth.me(), loadPlots(1)])
      .then(([u]) => setUser(u))
      .catch(() => {
        localStorage.removeItem('token')
        router.push('/auth/login')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen">Загрузка...</div>

  const freeCount = plots.filter(p => p.status === 'free').length
  const reservedCount = plots.filter(p => p.status === 'reserved').length
  const soldCount = plots.filter(p => p.status === 'sold').length
  const totalArea = plots.reduce((s, p) => s + (p.area_m2 || 0), 0) / 10000
  const totalPrice = plots.reduce((s, p) => s + (p.price || 0), 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col">
        <h1 className="text-lg font-bold mb-6">LandSearch Admin</h1>
        <nav className="space-y-2 flex-1">
          {[
            { key: 'dashboard', label: 'Дашборд' },
            { key: 'plots', label: 'Участки' },
            { key: 'import', label: 'Импорт' },
            { key: 'leads', label: 'Заявки' },
            { key: 'settings', label: 'Настройки' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-3 py-2 rounded text-sm ${
                activeTab === tab.key ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400">{user?.email}</p>
          <button
            onClick={() => { localStorage.removeItem('token'); router.push('/auth/login') }}
            className="text-sm text-red-400 hover:text-red-300 mt-1"
          >
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {activeTab === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Дашборд</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Всего участков</p>
                <p className="text-3xl font-bold">{total}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Свободно</p>
                <p className="text-3xl font-bold text-green-600">{freeCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">В резерве</p>
                <p className="text-3xl font-bold text-yellow-600">{reservedCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Продано</p>
                <p className="text-3xl font-bold text-red-600">{soldCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Общая площадь</p>
                <p className="text-3xl font-bold">{totalArea.toFixed(1)} га</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Общая стоимость</p>
                <p className="text-3xl font-bold">{new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plots' && (
          <PlotsTab
            plots={plots}
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => { setPage(p); loadPlots(p) }}
          />
        )}
        {activeTab === 'import' && <ImportTab />}
        {activeTab === 'leads' && <LeadsTab />}
      </main>
    </div>
  )
}

function PlotsTab({
  plots,
  page,
  totalPages,
  onPageChange,
}: {
  plots: Plot[]
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Участки</h2>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Кадастровый номер</th>
              <th className="text-left px-4 py-3">Площадь</th>
              <th className="text-left px-4 py-3">ВРИ</th>
              <th className="text-right px-4 py-3">Цена</th>
              <th className="text-center px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {plots.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{p.cadastral_number}</td>
                <td className="px-4 py-3">{p.area_m2 ? `${(p.area_m2 / 100).toFixed(1)} сот.` : '-'}</td>
                <td className="px-4 py-3">{p.permitted_use || '-'}</td>
                <td className="px-4 py-3 text-right">{p.price ? `${new Intl.NumberFormat('ru-RU').format(p.price)} ₽` : '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    p.status === 'free' ? 'bg-green-100 text-green-700' :
                    p.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' :
                    p.status === 'booked' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {p.status === 'free' ? 'Свободен' :
                     p.status === 'reserved' ? 'В резерве' :
                     p.status === 'booked' ? 'Забронирован' : 'Продан'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 text-sm rounded border disabled:opacity-40 hover:bg-gray-100"
            >
              Назад
            </button>
            <span className="text-sm text-gray-500">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 text-sm rounded border disabled:opacity-40 hover:bg-gray-100"
            >
              Вперёд
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ImportTab() {
  const [imports, setImports] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api.imports.list().then(setImports).catch(() => {})
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await api.imports.upload(file)
      setImports((prev) => [result, ...prev])
      alert(`Импорт завершён: ${result.success_rows} из ${result.total_rows} участков`)
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`)
    }
    setUploading(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Импорт участков</h2>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="font-semibold mb-2">Загрузить Excel/CSV</h3>
        <p className="text-sm text-gray-500 mb-3">
          Формат: колонка <strong>cadastral_number</strong> (обязательно),
          price, title, status, area_m2
        </p>
        <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
          {uploading ? 'Загрузка...' : 'Выбрать файл'}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      <div className="bg-white rounded-lg shadow">
        <h3 className="font-semibold p-4 border-b">История импортов</h3>
        {imports.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">Нет импортов</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2">Источник</th>
                <th className="text-left px-4 py-2">Статус</th>
                <th className="text-right px-4 py-2">Успешно</th>
                <th className="text-right px-4 py-2">Всего</th>
                <th className="text-left px-4 py-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp: any) => (
                <tr key={imp.id} className="border-t">
                  <td className="px-4 py-2">{imp.source}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      imp.status === 'completed' ? 'bg-green-100 text-green-700' :
                      imp.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{imp.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{imp.success_rows}</td>
                  <td className="px-4 py-2 text-right">{imp.total_rows}</td>
                  <td className="px-4 py-2">{new Date(imp.created_at).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function LeadsTab() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    api.leads.list().then(setLeads).catch(() => {})
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Заявки</h2>
      {leads.length === 0 ? (
        <p className="text-gray-500">Нет заявок</p>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => (
            <div key={l.id} className="bg-white p-4 rounded-lg shadow">
              <p className="font-semibold">{l.buyer_name || 'Аноним'}</p>
              {l.buyer_phone && <p className="text-sm">{l.buyer_phone}</p>}
              {l.buyer_email && <p className="text-sm">{l.buyer_email}</p>}
              {l.message && <p className="text-sm mt-1">{l.message}</p>}
              <p className="text-xs text-gray-400 mt-1">{new Date(l.created_at).toLocaleString('ru-RU')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
