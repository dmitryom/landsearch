'use client'

import { useEffect, useState } from 'react'
import { safeGet, safeSet } from '@/lib/storage'

type LayoutSetter = (next: number | ((current: number) => number)) => void

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function usePersistentLayout(
  key: string,
  initial: number,
  min: number,
  max: number,
): readonly [number, LayoutSetter] {
  const fallback = clamp(initial, min, max)
  const [value, setValue] = useState(fallback)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = Number(safeGet(key))
    if (Number.isFinite(stored)) setValue(clamp(stored, min, max))
    setHydrated(true)
  }, [key, min, max])

  useEffect(() => {
    if (hydrated) safeSet(key, String(clamp(value, min, max)))
  }, [hydrated, key, max, min, value])

  const updateValue: LayoutSetter = (next) => {
    setValue((current) => clamp(typeof next === 'function' ? next(current) : next, min, max))
  }

  return [value, updateValue] as const
}
