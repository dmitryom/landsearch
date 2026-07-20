'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { safeGet, safeSet } from './storage'

export function usePersistentBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState(initialValue)
  const [hydrated, setHydrated] = useState(false)
  const skipPersistRef = useRef(false)
  const userChangedRef = useRef(false)
  const loadedKeyRef = useRef(key)

  useEffect(() => {
    const isKeyChange = loadedKeyRef.current !== key
    const userChangedBeforeHydration = !isKeyChange && userChangedRef.current
    loadedKeyRef.current = key
    if (isKeyChange) userChangedRef.current = false
    const stored = safeGet(key)
    if (!userChangedBeforeHydration && (stored === 'true' || stored === 'false')) {
      setValue(stored === 'true')
    }
    skipPersistRef.current = !userChangedBeforeHydration
    setHydrated(true)
    userChangedRef.current = false
  }, [key])

  useEffect(() => {
    if (hydrated && skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    if (hydrated) safeSet(key, String(value))
  }, [hydrated, key, value])

  const setPersistentValue = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    userChangedRef.current = true
    skipPersistRef.current = false
    setValue(next)
  }, [])

  return [value, setPersistentValue] as const
}
