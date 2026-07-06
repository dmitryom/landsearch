'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Критическая ошибка</h2>
            <p className="text-gray-600 mb-6 text-sm">
              Произошла фатальная ошибка. Перезагрузите страницу.
            </p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
