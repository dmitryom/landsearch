'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, type Plot } from '@/lib/api'
import { STATUS_STYLES } from '@/lib/constants'
import { DataTable, type ColumnDef } from '@/components/ui/DataTable'
import { Pin, PinOff, Trash2 } from 'lucide-react'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: 'free', label: 'Свободен' },
  { value: 'reserved', label: 'В резерве' },
  { value: 'booked', label: 'Забронирован' },
  { value: 'sold', label: 'Продан' },
] as const

const STATUS_FACETED = STATUS_OPTIONS.map((s) => ({ label: s.label, value: s.value }))

interface NspdData {
  cadastral_number?: string
  address?: string
  area_m2?: number
  category?: string
  permitted_use?: string
  cadastral_value?: number
  cad_unit?: string
  cad_status?: string
  object_type?: string
  land_plot_type?: string
  registration_date?: string
  ownership_form?: string
  geometry?: Record<string, unknown>
  center_lng?: number
  center_lat?: number
}

export default function AdminPlotsPage() {
  const [plots, setPlots] = useState<Plot[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [pinnedColumns, setPinnedColumns] = useState<Record<string, 'left' | 'right'>>({
    cadastral_number: 'left',
    actions: 'right',
  })

  const [showCreate, setShowCreate] = useState(false)
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [nspdData, setNspdData] = useState<NspdData | null>(null)

  const [form, setForm] = useState({
    cadastral_number: '',
    address: '',
    area_m2: '',
    category: '',
    permitted_use: '',
    cadastral_value: '',
    price: '',
    status: 'free',
    title: '',
    object_type: '',
    land_plot_type: '',
    registration_date: '',
    ownership_form: '',
  })
  const [createLoading, setCreateLoading] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Plot>>({})
  const [editLoading, setEditLoading] = useState(false)

  const loadPlots = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await api.plots.list({ page: String(p), page_size: String(PAGE_SIZE) })
      setPlots(res.items)
      setTotal(res.total)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadPlots(page) }, [page, loadPlots])

  const handleStatusChange = async (plotId: string, newStatus: string) => {
    const prev = plots
    setPlots(ps => ps.map(p => p.id === plotId ? { ...p, status: newStatus as Plot['status'] } : p))
    setUpdatingId(plotId)
    try {
      await api.plots.update(plotId, { status: newStatus as Plot['status'] })
    } catch {
      setPlots(prev)
    }
    setUpdatingId(null)
  }

  const handleLookup = async () => {
    if (!lookupInput.trim()) return
    setLookupLoading(true)
    setLookupError('')
    setNspdData(null)
    try {
      const data = await api.plots.lookup(lookupInput.trim())
      setNspdData(data)
      setForm({
        cadastral_number: (data.cadastral_number as string) || lookupInput.trim(),
        address: (data.address as string) || '',
        area_m2: data.area_m2 ? String(data.area_m2) : '',
        category: (data.category as string) || '',
        permitted_use: (data.permitted_use as string) || '',
        cadastral_value: data.cadastral_value ? String(data.cadastral_value) : '',
        price: '',
        status: 'free',
        title: '',
        object_type: (data.object_type as string) || '',
        land_plot_type: (data.land_plot_type as string) || '',
        registration_date: (data.registration_date as string) || '',
        ownership_form: (data.ownership_form as string) || '',
      })
    } catch (e: any) {
      setLookupError(e.message || 'Не найдено')
    }
    setLookupLoading(false)
  }

  const handleCreate = async () => {
    if (!form.cadastral_number.trim()) return
    setCreateLoading(true)
    try {
      const payload: Record<string, unknown> = {
        cadastral_number: form.cadastral_number,
        address: form.address || undefined,
        area_m2: form.area_m2 ? parseFloat(form.area_m2) : undefined,
        category: form.category || undefined,
        permitted_use: form.permitted_use || undefined,
        cadastral_value: form.cadastral_value ? parseFloat(form.cadastral_value) : undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        status: form.status,
        title: form.title || undefined,
        object_type: form.object_type || undefined,
        land_plot_type: form.land_plot_type || undefined,
        registration_date: form.registration_date || undefined,
        ownership_form: form.ownership_form || undefined,
      }
      await api.plots.create(payload)
      setShowCreate(false)
      setNspdData(null)
      setLookupInput('')
      setForm({ cadastral_number: '', address: '', area_m2: '', category: '', permitted_use: '', cadastral_value: '', price: '', status: 'free', title: '', object_type: '', land_plot_type: '', registration_date: '', ownership_form: '' })
      loadPlots(1)
      setPage(1)
    } catch (e: any) {
      alert(e.message || 'Ошибка создания')
    }
    setCreateLoading(false)
  }

  const startEdit = (plot: Plot) => {
    setEditId(plot.id)
    setEditForm({
      address: plot.address || '',
      area_m2: plot.area_m2 || undefined,
      category: plot.category || '',
      permitted_use: plot.permitted_use || '',
      cadastral_value: plot.cadastral_value || undefined,
      price: plot.price || undefined,
      title: plot.title || '',
      object_type: plot.object_type || '',
      land_plot_type: plot.land_plot_type || '',
      registration_date: plot.registration_date || '',
      ownership_form: plot.ownership_form || '',
    })
  }

  const handleEditSave = async () => {
    if (!editId) return
    setEditLoading(true)
    try {
      await api.plots.update(editId, editForm)
      setEditId(null)
      loadPlots(page)
    } catch (e: any) {
      alert(e.message || 'Ошибка обновления')
    }
    setEditLoading(false)
  }

  const handleDelete = async (plotId: string) => {
    if (!confirm('Удалить участок?')) return
    try {
      await api.plots.delete(plotId)
      loadPlots(page)
    } catch {}
  }

  const [selectedRows, setSelectedRows] = useState<Plot[]>([])
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)

  const handleBulkDelete = async () => {
    if (!selectedRows.length) return
    if (!confirm(`Удалить ${selectedRows.length} участков?`)) return
    setBulkDeleteLoading(true)
    try {
      await api.plots.bulkDelete(selectedRows.map((r) => r.id))
      setSelectedRows([])
      loadPlots(page)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
      alert(msg || 'Ошибка удаления')
    }
    setBulkDeleteLoading(false)
  }

  const columns = useMemo<ColumnDef<Plot>[]>(() => [
    {
      accessorKey: 'cadastral_number',
      header: 'Кад. номер',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.cadastral_number}</span>
      ),
      sortingFn: 'text',
      size: 150,
      enableHiding: false,
    },
    {
      accessorKey: 'address',
      header: 'Адрес',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input value={String(editForm.address || '')} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full px-1 py-0.5 border rounded text-xs" />
        }
        return <span className="text-xs truncate max-w-[180px] block" title={p.address || ''}>{p.address || '-'}</span>
      },
      size: 200,
    },
    {
      accessorKey: 'area_m2',
      header: 'Площадь',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input type="number" value={String(editForm.area_m2 || '')} onChange={(e) => setEditForm({ ...editForm, area_m2: e.target.value ? parseFloat(e.target.value) : undefined })} className="w-full px-1 py-0.5 border rounded text-xs text-right" />
        }
        return <span className="text-xs text-right block">{p.area_m2 ? `${(p.area_m2 / 100).toFixed(1)} сот.` : '-'}</span>
      },
      sortingFn: 'basic',
      size: 80,
    },
    {
      accessorKey: 'permitted_use',
      header: 'ВРИ',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input value={String(editForm.permitted_use || '')} onChange={(e) => setEditForm({ ...editForm, permitted_use: e.target.value })} className="w-full px-1 py-0.5 border rounded text-xs" />
        }
        return <span className="text-xs">{p.permitted_use || '-'}</span>
      },
      size: 160,
    },
    {
      accessorKey: 'category',
      header: 'Категория',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input value={String(editForm.category || '')} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="w-full px-1 py-0.5 border rounded text-xs" />
        }
        return <span className="text-xs">{p.category || '-'}</span>
      },
      size: 140,
    },
    {
      accessorKey: 'ownership_form',
      header: 'Форма собств.',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input value={String(editForm.ownership_form || '')} onChange={(e) => setEditForm({ ...editForm, ownership_form: e.target.value })} className="w-full px-1 py-0.5 border rounded text-xs" />
        }
        return <span className="text-xs">{p.ownership_form || '-'}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'land_plot_type',
      header: 'Вид участка',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input value={String(editForm.land_plot_type || '')} onChange={(e) => setEditForm({ ...editForm, land_plot_type: e.target.value })} className="w-full px-1 py-0.5 border rounded text-xs" />
        }
        return <span className="text-xs">{p.land_plot_type || '-'}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'price',
      header: 'Цена',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return <input type="number" value={String(editForm.price || '')} onChange={(e) => setEditForm({ ...editForm, price: e.target.value ? parseFloat(e.target.value) : undefined })} className="w-full px-1 py-0.5 border rounded text-xs text-right" />
        }
        return <span className="text-xs text-right block">{p.price ? `${new Intl.NumberFormat('ru-RU').format(p.price)} ₽` : '-'}</span>
      },
      sortingFn: 'basic',
      size: 100,
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return (
            <select value={String(editForm.status || p.status)} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Plot['status'] })} className="px-1 py-0.5 border rounded text-xs w-full">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )
        }
        return (
          <select
            value={p.status}
            disabled={updatingId === p.id}
            onChange={(e) => handleStatusChange(p.id, e.target.value)}
            className={`px-2 py-0.5 rounded text-xs font-medium border-0 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer ${STATUS_STYLES[p.status] || 'bg-gray-100 text-gray-700'}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )
      },
      size: 110,
    },
    {
      id: 'actions',
      header: 'Действия',
      cell: ({ row }) => {
        const p = row.original
        if (editId === p.id) {
          return (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <button onClick={handleEditSave} disabled={editLoading} className="text-green-600 hover:text-green-800 text-xs">
                {editLoading ? '...' : 'Сохранить'}
              </button>
              <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-700 text-xs">Отмена</button>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button onClick={() => startEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs">Ред.</button>
            <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs">Удал.</button>
          </div>
        )
      },
      size: 110,
      enableHiding: false,
    },
  ], [updatingId, editId, editForm, editLoading, handleStatusChange, handleEditSave, startEdit, handleDelete])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Участки</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{total} всего</span>
          <button
            onClick={() => { setShowCreate(!showCreate); setNspdData(null); setLookupInput(''); setLookupError(''); }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            {showCreate ? 'Отмена' : '+ Добавить участок'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="font-semibold mb-3">Поиск в ЕГРН / Росреестр</h3>
          <div className="flex gap-2 mb-4">
            <input
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Кадастровый номер (напр. 16:24:090704:5492)"
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleLookup}
              disabled={lookupLoading}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {lookupLoading ? 'Поиск...' : 'Найти в ЕГРН'}
            </button>
          </div>
          {lookupError && <p className="text-red-600 text-sm mb-3">{lookupError}</p>}

          {nspdData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-green-800 mb-1">Данные из ЕГРН загружены:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-green-700">
                {nspdData.object_type && <span>Вид объекта: {nspdData.object_type}</span>}
                {nspdData.land_plot_type && <span>Вид участка: {nspdData.land_plot_type}</span>}
                {nspdData.registration_date && <span>Дата reg.: {nspdData.registration_date}</span>}
                {nspdData.cad_unit && <span>Квартал: {nspdData.cad_unit}</span>}
                {nspdData.area_m2 && <span>Площадь: {nspdData.area_m2} м²</span>}
                {nspdData.cad_status && <span>Статус ЕГРН: {nspdData.cad_status}</span>}
                {nspdData.category && <span>Категория: {nspdData.category}</span>}
                {nspdData.permitted_use && <span>ВРИ: {nspdData.permitted_use}</span>}
                {nspdData.ownership_form && <span>Форма собств.: {nspdData.ownership_form}</span>}
                {nspdData.cadastral_value && <span>Кадастровая стоимость: {new Intl.NumberFormat('ru-RU').format(nspdData.cadastral_value)} ₽</span>}
              </div>
            </div>
          )}

          <h3 className="font-semibold mb-3">Данные участка</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Кадастровый номер *</label>
              <input value={form.cadastral_number} onChange={(e) => setForm({ ...form, cadastral_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Адрес</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Площадь (м²)</label>
              <input type="number" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Цена (₽)</label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Категория</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ВРИ</label>
              <input value={form.permitted_use} onChange={(e) => setForm({ ...form, permitted_use: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Вид объекта</label>
              <input value={form.object_type} onChange={(e) => setForm({ ...form, object_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Вид участка</label>
              <input value={form.land_plot_type} onChange={(e) => setForm({ ...form, land_plot_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Дата регистрации</label>
              <input value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Форма собственности</label>
              <input value={form.ownership_form} onChange={(e) => setForm({ ...form, ownership_form: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Статус продажи</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Название</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={createLoading || !form.cadastral_number.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {createLoading ? 'Создание...' : 'Создать участок'}
          </button>
        </div>
      )}

      <DataTable
        data={plots}
        columns={columns}
        searchPlaceholder="Поиск по кадастровому номеру, адресу..."
        facetedFilters={[
          {
            columnId: 'status',
            title: 'Статус',
            options: STATUS_FACETED,
          },
        ]}
        pageSize={20}
        loading={loading}
        enableRowSelection
        enableColumnResize
        exportFilename="plots"
        onRowSelect={setSelectedRows}
        toolbar={
          selectedRows.length > 0 ? (
            <div className="flex items-center gap-2 px-2 py-1 bg-red-50 rounded-lg text-xs text-red-700">
              <Trash2 className="w-3 h-3" />
              Выбрано: {selectedRows.length}
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading}
                className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteLoading ? 'Удаление...' : `Удалить (${selectedRows.length})`}
              </button>
              <button
                onClick={() => setSelectedRows([])}
                className="text-red-600 hover:text-red-800 underline"
              >
                Отмена
              </button>
            </div>
          ) : undefined
        }
      />
    </div>
  )
}
