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
