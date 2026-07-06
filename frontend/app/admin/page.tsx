'use client'

import { useEffect, useState } from 'react'
import { api, type PlotListResponse } from '@/lib/api'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ total: 0, free: 0, reserved: 0, sold: 0, totalArea: 0, totalPrice: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.plots.list({ page_size: '200' }).then((res: PlotListResponse) => {
      setStats({
        total: res.total,
        free: res.items.filter(p => p.status === 'free').length,
        reserved: res.items.filter(p => p.status === 'reserved' || p.status === 'booked').length,
        sold: res.items.filter(p => p.status === 'sold').length,
        totalArea: res.items.reduce((s, p) => s + (p.area_m2 || 0), 0) / 10000,
        totalPrice: res.items.reduce((s, p) => s + (p.price || 0), 0),
      })
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Дашборд</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Всего участков" value={stats.total} />
        <StatCard title="Свободно" value={stats.free} color="text-green-600" />
        <StatCard title="В резерве" value={stats.reserved} color="text-yellow-600" />
        <StatCard title="Продано" value={stats.sold} color="text-red-600" />
        <StatCard title="Общая площадь" value={`${stats.totalArea.toFixed(1)} га`} />
        <StatCard title="Общая стоимость" value={`${new Intl.NumberFormat('ru-RU').format(stats.totalPrice)} ₽`} />
      </div>
    </div>
  )
}

function StatCard({ title, value, color }: { title: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <p className="text-gray-500 text-sm">{title}</p>
      <p className={`text-3xl font-bold ${color || ''}`}>{value}</p>
    </div>
  )
}
