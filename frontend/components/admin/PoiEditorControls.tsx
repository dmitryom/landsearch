'use client'

import { MapPin, Plus, Save, Trash2, X } from 'lucide-react'
import type { PoiType, SettlementPoi } from '@/lib/api'
import { POI_COLORS, POI_LABELS, POI_TYPES } from '@/lib/settlement-pois'

export interface SettlementPoiDraft {
  id?: string
  poi_type: PoiType
  custom_type_label: string
  name: string
  description: string
  longitude: number
  latitude: number
  is_published: boolean
}

interface PoiEditorControlsProps {
  pois: SettlementPoi[]
  draft: SettlementPoiDraft | null
  selectedId: string | null
  busy: boolean
  placementType: PoiType
  onPlacementTypeChange: (type: PoiType) => void
  onStartPlacement: (type: PoiType) => void
  onSelect: (poi: SettlementPoi) => void
  onChange: (draft: SettlementPoiDraft) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}

function poiTitle(poi: SettlementPoi): string {
  return poi.poi_type === 'other' && poi.custom_type_label?.trim()
    ? poi.custom_type_label
    : POI_LABELS[poi.poi_type]
}

export default function PoiEditorControls({
  pois,
  draft,
  selectedId,
  busy,
  placementType,
  onPlacementTypeChange,
  onStartPlacement,
  onSelect,
  onChange,
  onSave,
  onDelete,
  onCancel,
}: PoiEditorControlsProps) {
  const selectedType = draft?.poi_type || placementType

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ls-green)]">Объекты</p>
        <p className="mt-1 text-xs leading-5 text-[var(--ls-muted)]">Выберите категорию и поставьте метку на карте. Скрытые объекты видны только в редакторе.</p>
      </div>

      <label className="block text-xs font-medium text-gray-600">
        Категория
        <select
          value={selectedType}
          onChange={(event) => {
            const poi_type = event.target.value as PoiType
            if (draft) onChange({ ...draft, poi_type, custom_type_label: poi_type === 'other' ? draft.custom_type_label : '' })
            else onPlacementTypeChange(poi_type)
          }}
          disabled={busy}
          className="mt-1 w-full rounded-md border border-[var(--ls-line)] bg-white px-3 py-2 text-sm text-[var(--ls-ink)]"
        >
          {POI_TYPES.map((type) => <option key={type} value={type}>{POI_LABELS[type]}</option>)}
        </select>
      </label>

      {!draft && (
        <button
          type="button"
          onClick={() => onStartPlacement(selectedType)}
          disabled={busy}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--ls-green-dark)] disabled:opacity-40"
        >
          <MapPin className="h-4 w-4" /> Поставить объект
        </button>
      )}

      {draft && (
        <div className="space-y-3 border-y border-[var(--ls-line)] py-3">
          {draft.poi_type === 'other' && (
            <label className="block text-xs font-medium text-gray-600">
              Свой тип
              <input
                value={draft.custom_type_label}
                onChange={(event) => onChange({ ...draft, custom_type_label: event.target.value })}
                disabled={busy}
                maxLength={100}
                className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm text-[var(--ls-ink)]"
              />
            </label>
          )}
          <label className="block text-xs font-medium text-gray-600">
            Название
            <input
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              disabled={busy}
              maxLength={160}
              className="mt-1 w-full rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm text-[var(--ls-ink)]"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Описание
            <textarea
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              disabled={busy}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-[var(--ls-line)] px-3 py-2 text-sm text-[var(--ls-ink)]"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--ls-ink)]">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={(event) => onChange({ ...draft, is_published: event.target.checked })}
              disabled={busy}
              className="h-4 w-4 rounded border-[var(--ls-line)] text-[var(--ls-green)] focus:ring-[var(--ls-green)]"
            />
            Опубликовать на карте
          </label>
          <p className="text-[11px] text-[var(--ls-muted)]">Ш: {draft.latitude.toFixed(6)} · Д: {draft.longitude.toFixed(6)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={busy || !draft.name.trim() || (draft.poi_type === 'other' && !draft.custom_type_label.trim())}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--ls-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--ls-green-dark)] disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> Сохранить
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              title="Отменить редактирование объекта"
              aria-label="Отменить редактирование объекта"
              className="inline-flex min-h-10 w-10 items-center justify-center rounded-md border border-[var(--ls-line)] text-[var(--ls-muted)] hover:bg-[var(--ls-paper)] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {selectedId && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Удалить объект
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 overflow-y-auto">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--ls-muted)]">Размещенные объекты</p>
        <div className="space-y-1">
          {pois.map((poi) => (
            <button
              key={poi.id}
              type="button"
              onClick={() => onSelect(poi)}
              disabled={busy}
              className={'flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition ' + (selectedId === poi.id ? 'border-[var(--ls-green)] bg-[#e4f1ec]' : 'border-transparent hover:bg-[var(--ls-paper)]')}
            >
              <span className={'h-2.5 w-2.5 shrink-0 rounded-full' + (!poi.is_published ? ' opacity-40' : '')} style={{ backgroundColor: POI_COLORS[poi.poi_type] }} />
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--ls-ink)]">{poi.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--ls-muted)]">{poi.is_published ? poiTitle(poi) : 'Скрыт'}</span>
            </button>
          ))}
          {!pois.length && <p className="py-2 text-xs text-[var(--ls-muted)]">Объектов пока нет.</p>}
        </div>
      </div>

      {!draft && pois.length > 0 && (
        <button
          type="button"
          onClick={() => onStartPlacement(selectedType)}
          disabled={busy}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[var(--ls-line)] px-3 py-2 text-xs font-medium text-[var(--ls-ink)] hover:bg-[var(--ls-paper)] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Новый объект
        </button>
      )}
    </div>
  )
}
