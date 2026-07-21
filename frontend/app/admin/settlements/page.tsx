'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api, type Settlement, type SettlementCreate } from '@/lib/api'
import BoundaryEditor from '@/components/admin/BoundaryEditor'

type CatalogItem = {
  name?: unknown
  district?: unknown
  settlement?: unknown
  address?: unknown
  developer?: unknown
  land_types?: unknown
  website?: unknown
  notes?: unknown
}

function catalogToSettlement(item: CatalogItem): SettlementCreate {
  if (typeof item.name !== 'string' || !item.name.trim()) throw new Error('У каждой записи должно быть название поселка')
  const detail = [
    typeof item.developer === 'string' && `Застройщик: ${item.developer}`,
    Array.isArray(item.land_types) && item.land_types.length > 0 && `Тип земли: ${item.land_types.join(', ')}`,
    typeof item.notes === 'string' && item.notes,
    typeof item.website === 'string' && `Источник: ${item.website}`,
  ].filter(Boolean).join('. ')
  const district = typeof item.district === 'string' ? item.district : undefined
  const locality = typeof item.address === 'string' ? item.address : typeof item.settlement === 'string' ? item.settlement : undefined
  return {
    name: item.name.trim(),
    description: detail || undefined,
    address: locality || district,
    region: 'Республика Татарстан',
    district,
  }
}

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [settlementQuery, setSettlementQuery] = useState('')
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')

  const loadSettlements = useCallback(() => {
    api.settlements.list()
      .then((items) => {
        setSettlements(items)
        setSelectedId((current) => current || items[0]?.id || '')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить поселки'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadSettlements()
  }, [loadSettlements])

  const filteredSettlements = useMemo(() => {
    const query = settlementQuery.trim().toLocaleLowerCase('ru-RU')
    if (!query) return settlements
    return settlements.filter((item) => [item.name, item.address, item.description, item.district, item.region]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(query))
  }, [settlementQuery, settlements])

  useEffect(() => {
    if (!filteredSettlements.length) {
      setSelectedId('')
      setSelected(null)
      return
    }
    if (!filteredSettlements.some((item) => item.id === selectedId)) {
      setSelectedId(filteredSettlements[0]?.id ?? '')
    }
  }, [filteredSettlements, selectedId])

  useEffect(() => {
    if (!selectedId) return
    setSelected(null)
    api.settlements.get(selectedId, { include_plots: false })
      .then(setSelected)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить границу'))
  }, [selectedId])

  if (loading) return <div className="rounded-lg border border-[var(--ls-line)] bg-white p-6 text-sm text-[var(--ls-muted)]">Загрузка поселков...</div>
  if (error && !selected) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>

  const importCatalog = async () => {
    setError('')
    setNotice('')
    try {
      const raw = JSON.parse(importText)
      if (!Array.isArray(raw)) throw new Error('Ожидается JSON-массив поселков')
      const result = await api.settlements.bulkCreate(raw.map(catalogToSettlement))
      setNotice(`Добавлено: ${result.created}. Уже существовало: ${result.skipped}.`)
      setImportText('')
      setImportOpen(false)
      loadSettlements()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать каталог')
    } finally {
      setImporting(false)
    }
  }

  const deleteSettlement = async () => {
    if (!selected) return
    const selectedSettlement = selected
    if (!window.confirm(`Удалить поселок «${selectedSettlement.name}»? Сам поселок и его граница будут удалены. Связанные участки не удалятся, а будут отвязаны от поселка.`)) return

    setError('')
    setNotice('')
    setDeleting(true)
    try {
      const result = await api.settlements.delete(selectedSettlement.id)
      const selectedIdToDelete = selectedSettlement.id
      setSettlements((items) => items.filter((item) => item.id !== selectedIdToDelete))
      setSelected(null)
      setSelectedId('')
      setNotice(`Поселок «${result.name}» удален. Участков отвязано: ${result.unlinked_plots}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить поселок')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">LandSearch · территория</p>
          <h1 className="text-2xl font-bold text-[var(--ls-ink)]">Границы поселков</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ls-muted)]">Нарисуйте полигон или задайте радиус. Только участки внутри сохраненной границы попадут на публичную карту.</p>
        </div>
        <div className="flex min-w-[260px] flex-col gap-2">
          <button type="button" onClick={() => setImportOpen((value) => !value)} className="min-h-11 rounded-md bg-[var(--ls-green)] px-3 text-sm font-semibold text-white hover:bg-[var(--ls-green-dark)]">Импортировать каталог</button>
          <label className="block text-xs font-medium text-[var(--ls-muted)]">
            Поиск поселка, населенного пункта или адреса
            <input
              type="search"
              value={settlementQuery}
              onChange={(event) => setSettlementQuery(event.target.value)}
              placeholder="Название, адрес, район или регион"
              className="mt-1 w-full rounded-md border border-[var(--ls-line)] bg-white px-3 py-2 text-sm text-[var(--ls-ink)]"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--ls-muted)]">
            Поселок или населенный пункт
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--ls-line)] bg-white px-3 py-2 text-sm text-[var(--ls-ink)]">
              {filteredSettlements.map((item) => <option key={item.id} value={item.id}>{item.name}{item.address ? ` · ${item.address}` : item.region ? ` · ${item.region}` : ''}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-[var(--ls-muted)]">Найдено: {filteredSettlements.length}</span>
          </label>
        </div>
      </div>
      {notice && <p className="rounded-md border border-[#bad8ca] bg-[#f4fbf7] px-3 py-2 text-sm text-[var(--ls-green-dark)]" role="status">{notice}</p>}
      {importOpen && (
        <section className="rounded-md border border-[var(--ls-line)] bg-white p-4">
          <label htmlFor="settlement-catalog" className="block text-sm font-semibold text-[var(--ls-ink)]">Каталог поселков в JSON</label>
          <textarea id="settlement-catalog" value={importText} onChange={(event) => setImportText(event.target.value)} className="mt-2 min-h-56 w-full rounded-md border border-[var(--ls-line)] p-3 font-mono text-xs" placeholder='[{"name":"Лесное озеро","district":"Пестречинский"}]' />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={!importText.trim() || importing} onClick={() => { setImporting(true); void importCatalog() }} className="min-h-11 rounded-md bg-[var(--ls-green)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{importing ? 'Импорт...' : 'Добавить поселки'}</button>
            <button type="button" disabled={importing} onClick={() => setImportOpen(false)} className="min-h-11 rounded-md border border-[var(--ls-line)] px-4 text-sm font-semibold text-[var(--ls-ink)]">Отмена</button>
          </div>
        </section>
      )}
      {selected && (
        <>
          <section className="flex flex-col gap-3 rounded-md border border-[var(--ls-line)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ls-muted)]">Выбранный поселок</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-[var(--ls-ink)]">{selected.name}</h2>
              <p className="mt-1 text-xs text-[var(--ls-muted)]">Удаление отвяжет связанные участки, но не удалит их из базы.</p>
            </div>
            <button
              type="button"
              onClick={() => void deleteSettlement()}
              disabled={deleting}
              aria-label={`Удалить поселок ${selected.name}`}
              title="Удалить поселок"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deleting ? 'Удаление...' : 'Удалить поселок'}
            </button>
          </section>
          <BoundaryEditor key={selected.id} settlement={selected} onSaved={setSelected} />
        </>
      )}
    </div>
  )
}
