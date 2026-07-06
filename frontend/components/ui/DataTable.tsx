'use client'

import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode, type RefObject } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  createColumnHelper,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
  type PaginationState,
  type FilterFn,
  type Column,
  type Table,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Download,
  X,
  Check,
  Filter,
} from 'lucide-react'

export type { ColumnDef, Column, Table }
export { createColumnHelper }

// -- Indeterminate checkbox --
function IndeterminateCheckbox({
  indeterminate,
  ...rest
}: { indeterminate?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return <input type="checkbox" ref={ref} {...rest} className="rounded border-gray-300" />
}

// -- Global filter fn with match-sorter --
const globalFilterFn: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value)
  addMeta({ itemRank })
  return itemRank.passed
}

// -- Text filter fn for column filters --
const textFilterFn: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(String(row.getValue(columnId) ?? ''), String(value))
  addMeta({ itemRank })
  return itemRank.passed
}

// -- Export to CSV --
function exportToCSV<TData>(table: Table<TData>, filename: string) {
  const headers = table.getVisibleLeafColumns().map((col) => col.columnDef.header as string)
  const rows = table.getFilteredRowModel().rows.map((row) =>
    row.getVisibleCells().map((cell) => {
      const val = cell.getValue()
      if (val == null) return ''
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    })
  )
  const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// -- Faceted Filter component --
function FacetedFilter<TData>({
  column,
  title,
  options,
}: {
  column: Column<TData, unknown>
  title: string
  options: { label: string; value: string; icon?: ReactNode }[]
}) {
  const [open, setOpen] = useState(false)
  const selected = (column.getFilterValue() as string[]) ?? []

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    column.setFilterValue(next.length ? next : undefined)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 text-xs border rounded-lg hover:bg-gray-50 ${
          selected.length ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200'
        }`}
      >
        <Filter className="w-3 h-3" />
        {title}
        {selected.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-48 bg-white border rounded-lg shadow-lg p-1 max-h-60 overflow-auto">
            {options.map((opt) => {
              const isActive = selected.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-gray-100 ${
                    isActive ? 'bg-blue-50' : ''
                  }`}
                >
                  <span
                    className={`w-4 h-4 border rounded flex items-center justify-center ${
                      isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    }`}
                  >
                    {isActive && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              )
            })}
            {selected.length > 0 && (
              <button
                onClick={() => column.setFilterValue(undefined)}
                className="w-full px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded mt-1 border-t"
              >
                Сбросить
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// -- Column Visibility dropdown --
function ColumnVisibilityDropdown<TData>({ table }: { table: Table<TData> }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
        title="Видимость колонок"
      >
        <Settings2 className="w-3 h-3" />
        Колонки
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-52 bg-white border rounded-lg shadow-lg p-1 max-h-72 overflow-auto">
            {table.getAllLeafColumns()
              .filter((col) => col.columnDef.header)
              .map((col) => {
                const visible = col.getIsVisible()
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={col.getToggleVisibilityHandler()}
                      className="rounded border-gray-300"
                    />
                    <span className="truncate">{col.columnDef.header as string}</span>
                  </label>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

// -- Pagination --
function Pagination({ table }: { table: Table<any> }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Строк:</span>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className="px-2 py-1 border rounded text-xs"
        >
          {[10, 20, 50, 100].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 ml-2">
          {table.getFilteredSelectedRowModel().rows.length} / {table.getFilteredRowModel().rows.length} выбрано
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          title="Первая"
        >
          <ChevronLeft className="w-3 h-3" /><ChevronLeft className="w-3 h-3 -ml-2" />
        </button>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {(() => {
          const page = table.getState().pagination.pageIndex
          const total = table.getPageCount()
          let start = Math.max(0, page - 2)
          if (start + 5 > total) start = Math.max(0, total - 5)
          const count = Math.min(5, total)
          return Array.from({ length: count }, (_, i) => {
            const p = start + i
            return (
              <button
                key={p}
                onClick={() => table.setPageIndex(p)}
                className={`px-2 py-1 text-xs rounded ${
                  p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
                }`}
              >
                {p + 1}
              </button>
            )
          })
        })()}
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          title="Последняя"
        >
          <ChevronRight className="w-3 h-3" /><ChevronRight className="w-3 h-3 -ml-2" />
        </button>
      </div>
      <span className="text-xs text-gray-500">
        {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
      </span>
    </div>
  )
}

// -- Resize handle --
function ResizeHandle({ header }: { header: import('@tanstack/react-table').Header<any, unknown> }) {
  const column = header.column
  return (
    <div
      onDoubleClick={() => column.resetSize()}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
        column.getIsResizing() ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
      }`}
    />
  )
}

// -- Main DataTable --
interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, any>[]
  searchPlaceholder?: string
  searchColumn?: string
  facetedFilters?: { columnId: string; title: string; options: { label: string; value: string; icon?: ReactNode }[] }[]
  pageSize?: number
  loading?: boolean
  loadingRows?: number
  enableRowSelection?: boolean
  enableColumnResize?: boolean
  onRowSelect?: (rows: TData[]) => void
  exportFilename?: string
  children?: ReactNode
  toolbar?: ReactNode
}

export function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = 'Поиск...',
  searchColumn,
  facetedFilters = [],
  pageSize = 20,
  loading = false,
  loadingRows = 8,
  enableRowSelection = false,
  enableColumnResize = true,
  onRowSelect,
  exportFilename = 'export',
  children,
  toolbar,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const allColumns = useMemo<ColumnDef<TData, any>[]>(() => {
    if (!enableRowSelection) return columns
    return [
      {
        id: 'select',
        header: ({ table }) => (
          <IndeterminateCheckbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <IndeterminateCheckbox
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      ...columns,
    ]
  }, [columns, enableRowSelection])

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    columnResizeMode: 'onChange',
    initialState: { pagination: { pageSize } },
  })

  // Apply faceted column filter functions
  useMemo(() => {
    facetedFilters.forEach((f) => {
      const col = table.getColumn(f.columnId)
      if (col) col.columnDef.filterFn = textFilterFn
    })
  }, [facetedFilters, table])

  // Sync selected rows to parent via onRowSelect callback
  useEffect(() => {
    if (onRowSelect) {
      const selected = table.getFilteredRowModel().rows.filter((r) => rowSelection[r.id])
      onRowSelect(selected.map((r) => r.original))
    }
  }, [rowSelection, table, onRowSelect])

  const filterValue = searchColumn
    ? (table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''
    : globalFilter

  const setFilterValue = (val: string) => {
    if (searchColumn) {
      table.getColumn(searchColumn)?.setFilterValue(val)
    } else {
      setGlobalFilter(val)
    }
  }

  const activeFilters = columnFilters.length

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {children}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    {typeof col.header === 'string' ? col.header : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {children}

      {/* Toolbar */}
      <div className="px-4 py-3 border-b space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 min-w-[200px] max-w-sm px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {facetedFilters.map((f) => {
            const col = table.getColumn(f.columnId)
            if (!col) return null
            return (
              <FacetedFilter
                key={f.columnId}
                column={col}
                title={f.title}
                options={f.options}
              />
            )
          })}

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setColumnFilters([])
                setGlobalFilter('')
                if (searchColumn) table.getColumn(searchColumn)?.setFilterValue(undefined)
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg"
            >
              <X className="w-3 h-3" />
              Сбросить ({activeFilters})
            </button>
          )}

          <div className="flex-1" />

          <ColumnVisibilityDropdown table={table} />

          <button
            onClick={() => exportToCSV(table, exportFilename)}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            title="Экспорт в CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>

        {toolbar && <div>{toolbar}</div>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ width: enableColumnResize ? table.getCenterTotalSize() : undefined }}
        >
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isPinned = header.column.getIsPinned()
                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase select-none relative ${
                        header.column.getCanSort() ? 'cursor-pointer hover:bg-gray-100' : ''
                      } ${isPinned ? 'sticky bg-gray-50 z-10' : ''} ${
                        isPinned === 'left' ? 'left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''
                      } ${isPinned === 'right' ? 'right-0 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                      style={{
                        width: header.getSize(),
                        ...(isPinned === 'left' ? { left: header.column.getStart('left') } : {}),
                        ...(isPinned === 'right' ? { right: header.column.getAfter('right') } : {}),
                      }}
                    >
                      <div
                        className="flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-gray-400">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronsUpDown className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                      {enableColumnResize && header.column.getCanResize() && (
                        <ResizeHandle header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="px-3 py-8 text-center text-gray-400 text-sm"
                >
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isPinned = row.getIsSelected()
                return (
                  <tr
                    key={row.id}
                    className={`border-t hover:bg-gray-50 ${
                      row.getIsSelected() ? 'bg-blue-50' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pinned = cell.column.getIsPinned()
                      return (
                        <td
                          key={cell.id}
                          className={`px-3 py-2 ${
                            pinned ? 'sticky z-10 bg-white' : ''
                          } ${
                            pinned === 'left' ? 'left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''
                          } ${
                            pinned === 'right' ? 'right-0 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''
                          }`}
                          style={{
                            ...(pinned === 'left' ? { left: cell.column.getStart('left') } : {}),
                            ...(pinned === 'right' ? { right: cell.column.getAfter('right') } : {}),
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination table={table} />
    </div>
  )
}
