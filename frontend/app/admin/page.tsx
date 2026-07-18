'use client'

import { useEffect, useState } from 'react'
import { api, type PlotStatsResponse } from '@/lib/api'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlotStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.plots.stats()
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить статистику'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-md bg-white" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Статистика недоступна'}
      </div>
    )
  }

  const data_quality = stats.data_quality

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">LandSearch · NSPD</p>
          <h1 className="text-2xl font-bold text-[var(--ls-ink)]">Дашборд</h1>
        </div>
        <span className="hidden text-xs text-[var(--ls-muted)] sm:block">Состояние земельного фонда</span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Всего участков" value={stats.total} />
        <StatCard title="Свободно" value={stats.by_status.free || 0} color="text-green-600" />
        <StatCard title="В резерве" value={(stats.by_status.reserved || 0) + (stats.by_status.booked || 0)} color="text-yellow-600" />
        <StatCard title="Продано" value={stats.by_status.sold || 0} color="text-red-600" />
        <StatCard title="Общая площадь" value={`${stats.total_area_ha.toFixed(1)} га`} />
        <StatCard title="Общая стоимость" value={`${new Intl.NumberFormat('ru-RU').format(stats.total_price)} ₽`} />
        <StatCard
          title="Средняя цена"
          value={stats.avg_price_per_m2 ? `${new Intl.NumberFormat('ru-RU').format(Math.round(stats.avg_price_per_m2))} ₽/м²` : '—'}
        />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Качество данных</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <QualityCard title="Без геометрии" value={data_quality.missing_geometry} />
          <QualityCard title="Без цены" value={data_quality.missing_price} />
          <QualityCard title="Без площади" value={data_quality.missing_area} />
          <QualityCard title="Без категории" value={data_quality.missing_category} />
        </div>
      </section>
    </div>
  )
}

function StatCard({ title, value, color }: { title: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] p-4 shadow-sm">
      <p className="text-sm text-[var(--ls-muted)]">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${color || 'text-[var(--ls-ink)]'}`}>{value}</p>
    </div>
  )
}

function QualityCard({ title, value }: { title: string; value: number }) {
  const hasIssue = value > 0
  return (
    <div className="rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] p-4 shadow-sm">
      <p className="text-sm text-[var(--ls-muted)]">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${hasIssue ? 'text-orange-600' : 'text-green-600'}`}>{value}</p>
    </div>
  )
}
