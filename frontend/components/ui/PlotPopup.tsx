'use client'

import { useState } from 'react'
import { X, BarChart3 } from 'lucide-react'
import { STATUS_LABELS, STATUS_STYLES, vriColor } from '@/lib/constants'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function PlotPopup({
  plot,
  onClose,
}: {
  plot: Record<string, any>
  onClose: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleConsult = async () => {
    if (!phone) return
    setSending(true)
    try {
      await api.leads.create({
        plot_id: plot.id,
        buyer_phone: phone,
        buyer_name: '',
      })
      setSent(true)
    } catch {
      alert('Ошибка при отправке заявки. Попробуйте позже.')
    }
    setSending(false)
  }

  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-2xl z-20 border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white truncate">
            {plot.title || plot.cadastral_number}
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-white/70 text-xs font-mono mt-0.5">{plot.cadastral_number}</p>
      </div>

      <div className="p-4">
        <div className="space-y-2.5">
          {plot.price && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">Цена</span>
              <span className="text-lg font-bold text-gray-900">
                {new Intl.NumberFormat('ru-RU').format(plot.price)} ₽
              </span>
            </div>
          )}
          {plot.area_m2 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Площадь</span>
              <span className="text-sm font-medium">
                {(plot.area_m2 / 100).toFixed(1)} сот. ({plot.area_m2.toFixed(0)} м²)
              </span>
            </div>
          )}
          {plot.use && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">ВРИ</span>
              <span className="text-sm font-medium flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ backgroundColor: vriColor(plot.vri_code || plot.use) }} />
                {plot.use}
              </span>
            </div>
          )}
          {plot.vri_code && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Код ВРИ</span>
              <span className="text-sm font-medium">{plot.vri_code}</span>
            </div>
          )}
          {plot.category && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Категория</span>
              <span className="text-sm font-medium">{plot.category}</span>
            </div>
          )}
          {plot.ownership_form && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Форма собств.</span>
              <span className="text-sm font-medium">{plot.ownership_form}</span>
            </div>
          )}
          {plot.registration_date && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Дата reg.</span>
              <span className="text-sm font-medium">{plot.registration_date}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Статус</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[plot.status] || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[plot.status] || plot.status}
            </span>
          </div>
        </div>

        {plot.settlement_id && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <Link
              href={`/settlements/${plot.settlement_id}`}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <BarChart3 className="w-4 h-4" />
              Анализ поселения
            </Link>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <a
            href={`/plots/${plot.id}`}
            className="block text-center px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Подробнее
          </a>

          {!showForm && !sent && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full px-3 py-2 border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Получить консультацию
            </button>
          )}

          {showForm && !sent && (
            <div className="space-y-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ваш телефон"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleConsult}
                disabled={!phone || sending}
                className="w-full px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          )}

          {sent && (
            <p className="text-center text-sm text-green-600 font-medium">
              Заявка отправлена! Мы свяжемся с вами.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
