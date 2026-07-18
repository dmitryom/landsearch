'use client'

import { useEffect, useState } from 'react'
import { safeGet, safeSet } from './storage'

export function usePersistentBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState(initialValue)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = safeGet(key)
    if (stored === 'true' || stored === 'false') setValue(stored === 'true')
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (hydrated) safeSet(key, String(value))
  }, [hydrated, key, value])

  return [value, setValue] as const
}
