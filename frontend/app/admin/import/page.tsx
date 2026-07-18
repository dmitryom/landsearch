'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function AdminImportPage() {
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
      if (result.status === 'failed') {
        alert(`Импорт не выполнен: ${result.error || 'не удалось обработать файл'}`)
      } else {
        alert(`Импорт завершён: ${result.success_rows} из ${result.total_rows} участков`)
      }
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`)
    }
    setUploading(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">Данные</p>
      <h2 className="mb-4 text-2xl font-bold text-[var(--ls-ink)]">Импорт участков</h2>

      <div className="mb-6 rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] p-6 shadow-sm">
        <h3 className="mb-2 font-semibold">Загрузить Excel/CSV</h3>
        <p className="mb-3 text-sm text-[var(--ls-muted)]">
          Формат: колонка <strong>cadastral_number</strong> (обязательно),
          price, title, status, area_m2
        </p>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-[var(--ls-green)] px-4 py-2 font-medium text-white hover:bg-[var(--ls-green-dark)]">
          {uploading ? 'Загрузка...' : 'Выбрать файл'}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      <div className="rounded-md border border-[var(--ls-line)] bg-[var(--ls-surface)] shadow-sm">
        <h3 className="border-b border-[var(--ls-line)] p-4 font-semibold">История импортов</h3>
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
                <>
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
                {imp.error && (
                  <tr className="border-t border-[var(--ls-line)] bg-red-50/60">
                    <td colSpan={5} className="px-4 py-2 text-xs text-red-700">
                      {imp.error}
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
