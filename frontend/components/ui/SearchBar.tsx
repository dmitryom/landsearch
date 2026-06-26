'use client'

import { useState, useRef, useEffect } from 'react'
import { api, SearchSuggestion } from '@/lib/api'

export default function SearchBar({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.search.suggest(query)
        setSuggestions(res.results)
        setShow(true)
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
    setShow(false)
  }

  return (
    <div ref={ref} className="relative">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShow(true)}
          placeholder="Поиск по кадастровому номеру, адресу, посёлку..."
          className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>
      {show && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
              onClick={() => {
                setQuery(s.value)
                onSearch(s.value)
                setShow(false)
              }}
            >
              <span className={s.type === 'settlement' ? 'text-blue-600' : ''}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
