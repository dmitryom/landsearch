'use client'

const STATUS_LABELS: Record<string, string> = {
  free: 'Свободен',
  reserved: 'В резерве',
  booked: 'Забронирован',
  sold: 'Продан',
}

const STATUS_STYLES: Record<string, string> = {
  free: 'bg-green-100 text-green-700',
  reserved: 'bg-yellow-100 text-yellow-700',
  booked: 'bg-orange-100 text-orange-700',
  sold: 'bg-red-100 text-red-700',
}

export default function PlotPopup({
  plot,
  onClose,
}: {
  plot: Record<string, any>
  onClose: () => void
}) {
  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-2xl z-20 border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white truncate">
            {plot.title || plot.cadastral_number}
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white ml-2 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
          {plot.permitted_use && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">ВРИ</span>
              <span className="text-sm font-medium">{plot.permitted_use}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Статус</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[plot.status] || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[plot.status] || plot.status}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <a
            href={`/plots/${plot.id}`}
            className="flex-1 text-center px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Подробнее
          </a>
          <button
            className="flex-1 px-3 py-2 border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
            onClick={() => {
              const phone = prompt('Введите ваш телефон для консультации:')
              if (phone) {
                const el = document.createElement('a')
                el.href = `tel:${phone.replace(/[^0-9+]/g, '')}`
                el.click()
              }
            }}
          >
            Консультация
          </button>
        </div>
      </div>
    </div>
  )
}
