'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, type Plot } from '@/lib/api'
import { STATUS_STYLES } from '@/lib/constants'
import { DataTable, type ColumnDef } from '@/components/ui/DataTable'
import { ChevronLeft, ChevronRight, Pin, PinOff, Trash2 } from 'lucide-react'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const

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
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Plot['status'] | undefined>()
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

  const loadPlots = useCallback(async (p: number, size: number, query: string, status?: Plot['status']) => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(p), page_size: String(size) }
      if (query.trim()) params.query = query.trim()
      if (status) params.status = status
      const res = await api.plots.list(params)
      setPlots(res.items)
      setTotal(res.total)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadPlots(page, pageSize, searchQuery, statusFilter) }, [page, pageSize, searchQuery, statusFilter, loadPlots])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
    setSelectedRows([])
    setSelectAllMatching(false)
    setSelectionResetToken((token) => token + 1)
  }

  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(values[0] as Plot['status'] | undefined)
    setPage(1)
    setSelectedRows([])
    setSelectAllMatching(false)
    setSelectionResetToken((token) => token + 1)
  }

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
      loadPlots(1, pageSize, searchQuery, statusFilter)
      setPage(1)
    } catch (e: any) {
      alert(e.message || 'Ошибка создания')
    }
    setCreateLoading(false)
  }

  const startEdit = (plot: Plot) => {
    setEditId(plot.id)
    setEditForm({
      price: plot.price || undefined,
      status: plot.status,
    })
  }

  const handleEditSave = async () => {
    if (!editId) return
    setEditLoading(true)
    try {
      await api.plots.update(editId, editForm)
      setEditId(null)
      loadPlots(page, pageSize, searchQuery, statusFilter)
    } catch (e: any) {
      alert(e.message || 'Ошибка обновления')
    }
    setEditLoading(false)
  }

  const handleDelete = async (plotId: string) => {
    if (!confirm('Удалить участок?')) return
    try {
      await api.plots.delete(plotId)
      loadPlots(page, pageSize, searchQuery, statusFilter)
    } catch {}
  }

  const [selectedRows, setSelectedRows] = useState<Plot[]>([])
  const [selectAllMatching, setSelectAllMatching] = useState(false)
  const [selectionResetToken, setSelectionResetToken] = useState(0)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<Plot['status']>('free')
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false)

  const handleBulkDelete = async () => {
    const targetAll = selectAllMatching
    if (!targetAll && !selectedRows.length) return

    const targetCount = targetAll ? total : selectedRows.length
    if (targetAll) {
      const confirmation = window.prompt(
        `Будут скрыты ${targetCount} участков по текущему поиску и фильтру. Введите УДАЛИТЬ для подтверждения.`,
      )
      if (confirmation !== 'УДАЛИТЬ') return
    } else if (!confirm(`Удалить ${targetCount} участков?`)) {
      return
    }

    setBulkDeleteLoading(true)
    try {
      await api.plots.bulkDelete(targetAll ? [] : selectedRows.map((row) => row.id), {
        all_plots: targetAll,
        query: targetAll ? searchQuery.trim() || undefined : undefined,
        filter_status: targetAll ? statusFilter : undefined,
      })
      setSelectedRows([])
      setSelectAllMatching(false)
      setSelectionResetToken((value) => value + 1)
      await loadPlots(page, pageSize, searchQuery, statusFilter)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
      alert(msg || 'Ошибка удаления')
    }
    setBulkDeleteLoading(false)
  }

  const handleBulkStatusChange = async () => {
    const targetAll = selectAllMatching
    if (!targetAll && !selectedRows.length) return
    const targetCount = targetAll ? total : selectedRows.length
    if (!confirm(`Изменить статус у ${targetCount} участков на «${STATUS_OPTIONS.find((item) => item.value === bulkStatus)?.label}»?`)) return
    const previous = plots
    const selectedIds = selectedRows.map((row) => row.id)
    setBulkStatusLoading(true)
    setPlots((current) => current.map((plot) => selectedIds.includes(plot.id) ? { ...plot, status: bulkStatus } : plot))
    try {
      await api.plots.bulkUpdateStatus(targetAll ? [] : selectedIds, bulkStatus, {
        all_plots: targetAll,
        query: targetAll ? searchQuery.trim() || undefined : undefined,
        filter_status: targetAll ? statusFilter : undefined,
      })
      setSelectedRows([])
      setSelectAllMatching(false)
      setSelectionResetToken((value) => value + 1)
      await loadPlots(page, pageSize, searchQuery, statusFilter)
    } catch (e: unknown) {
      setPlots(previous)
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
      alert(msg || 'Ошибка массового изменения статуса')
    }
    setBulkStatusLoading(false)
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
        return <span className="block min-w-0 whitespace-normal break-words text-xs leading-5" title={p.address || ''}>{p.address || '-'}</span>
      },
      size: 200,
    },
    {
      accessorKey: 'area_m2',
      header: 'Площадь',
      cell: ({ row }) => {
        const p = row.original
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
        return <span className="text-xs">{p.permitted_use || '-'}</span>
      },
      size: 160,
    },
    {
      accessorKey: 'category',
      header: 'Категория',
      cell: ({ row }) => {
        const p = row.original
        return <span className="text-xs">{p.category || '-'}</span>
      },
      size: 140,
    },
    {
      accessorKey: 'ownership_form',
      header: 'Форма собств.',
      cell: ({ row }) => {
        const p = row.original
        return <span className="text-xs">{p.ownership_form || '-'}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'land_plot_type',
      header: 'Вид участка',
      cell: ({ row }) => {
        const p = row.original
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, total)
  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ls-muted)]">Рабочая область · NSPD</p>
          <h2 className="text-2xl font-bold text-[var(--ls-ink)]">Участки</h2>
        </div>
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#e4f1ec] px-2.5 py-1 text-sm font-semibold text-[var(--ls-green-dark)]">{total} всего</span>
          <span className="text-xs text-[var(--ls-muted)]" title="Кадастровые сведения загружены из Национальной системы пространственных данных">Источник данных: NSPD</span>
          <button
            type="button"
            onClick={() => { setShowCreate(!showCreate); setNspdData(null); setLookupInput(''); setLookupError(''); }}
            className="ml-auto min-h-11 rounded-md bg-[var(--ls-green)] px-3 text-sm font-semibold text-white hover:bg-[var(--ls-green-dark)] sm:ml-0"
          >
            {showCreate ? 'Отмена' : '+ Добавить участок'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="ls-panel mb-4 p-4">
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
                {nspdData.registration_date && <span>Дата регистрации: {nspdData.registration_date}</span>}
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

      <aside className="ls-panel mb-4 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ls-muted)]">Контроль данных</p>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-xs text-[var(--ls-muted)]">Показывается</dt><dd className="font-semibold">{firstRow}–{lastRow} из {total}</dd></div>
          <div><dt className="text-xs text-[var(--ls-muted)]">Источник геометрии</dt><dd className="font-semibold text-[var(--ls-green-dark)]">NSPD</dd></div>
          <div><dt className="text-xs text-[var(--ls-muted)]">Выбрано</dt><dd className="font-semibold">{selectAllMatching ? 'Все ' + total : selectedRows.length}</dd></div>
        </dl>
      </aside>

      <DataTable
        data={plots}
        columns={columns}
        searchPlaceholder="Поиск по кадастровому номеру, адресу..."
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        manualFiltering
        facetedFilters={[
          {
            columnId: 'status',
            title: 'Статус',
            options: STATUS_FACETED,
            singleSelect: true,
          },
        ]}
        onFacetedFilterChange={(columnId, values) => {
          if (columnId === 'status') handleStatusFilterChange(values)
        }}
        pageSize={pageSize}
        loading={loading}
        enableRowSelection
        selectAllRows={selectAllMatching}
        onSelectAllPage={(selected) => {
          if (!selected) setSelectAllMatching(false)
        }}
        enableColumnResize
        columnPreferencesKey="landsearch:admin-plots:columns"
        hidePagination
        manualPagination
        exportFilename="plots"
        onRowSelect={setSelectedRows}
        selectionResetToken={selectionResetToken}
        toolbar={
          selectedRows.length > 0 || selectAllMatching ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#bad8ca] bg-[#f0faf5] px-2 py-2 text-xs text-[var(--ls-green-dark)]">
              <span className="font-semibold">Выбрано {selectAllMatching ? total : selectedRows.length} / {total}</span>
              {!selectAllMatching && selectedRows.length > 0 && total > selectedRows.length && (
                <button
                  type="button"
                  onClick={() => setSelectAllMatching(true)}
                  className="font-medium text-[var(--ls-blue)] underline hover:text-[var(--ls-green-dark)]"
                >
                  Выбрать все {total} найденных
                </button>
              )}
              <label className="flex items-center gap-1">
                <span className="sr-only">Массовое изменение статуса</span>
                <select
                  aria-label="Массовое изменение статуса"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as Plot['status'])}
                  className="min-h-8 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <button
                onClick={handleBulkStatusChange}
                disabled={bulkStatusLoading || bulkDeleteLoading}
                className="min-h-8 rounded-md bg-[var(--ls-green)] px-3 py-1 font-semibold text-white hover:bg-[var(--ls-green-dark)] disabled:opacity-50"
              >
                {bulkStatusLoading ? 'Изменение...' : 'Изменить статус'}
              </button>
              <Trash2 className="ml-1 h-3 w-3 text-red-600" />
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading || bulkStatusLoading}
                className="rounded-md bg-[var(--ls-red)] px-3 py-1 text-white hover:bg-[#a94444] disabled:opacity-50"
              >
                {bulkDeleteLoading ? 'Удаление...' : `Удалить (${selectAllMatching ? total : selectedRows.length})`}
              </button>
              <button
                onClick={() => {
                  setSelectedRows([])
                  setSelectAllMatching(false)
                  setSelectionResetToken((value) => value + 1)
                }}
                className="text-[var(--ls-blue)] underline hover:text-[var(--ls-green-dark)]"
              >
                Отмена
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <span>{firstRow}-{lastRow} из {total}</span>
        <label className="flex items-center gap-2">
          Строк на странице
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            className="px-2 py-1 border rounded text-xs bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Предыдущая страница"
            aria-label="Предыдущая страница"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[72px] text-center">Страница {page} / {totalPages}</span>
          <button
            onClick={() => setPage(page === totalPages ? 1 : page + 1)}
            disabled={total === 0 || loading}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Следующая страница"
            aria-label="Следующая страница"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
