'use client'

import { useState, useRef, useEffect, useId, useMemo } from 'react'
import { Home, MapPin, Search, X } from 'lucide-react'
import { api, SearchSuggestion } from '@/lib/api'

export interface SearchRequest {
  query: string
  suggestion?: SearchSuggestion
}

interface SearchBarProps {
  onSearch: (request: SearchRequest) => void
  resetToken?: number
  value?: string
}

export default function SearchBar({ onSearch, resetToken = 0, value = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [show, setShow] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const suggestRequestRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const suppressSuggestionQueryRef = useRef<string | null>(null)
  const inputId = useId()
  const suggestionsId = `${inputId}-suggestions`

  const groupedSuggestions = useMemo(() => {
    const groups = new Map<SearchSuggestion['type'], SearchSuggestion[]>()
    for (const suggestion of suggestions) {
      const group = groups.get(suggestion.type) || []
      group.push(suggestion)
      groups.set(suggestion.type, group)
    }
    return Array.from(groups.entries())
  }, [suggestions])

  useEffect(() => {
    const requestId = ++suggestRequestRef.current
    abortRef.current?.abort()

    if (suppressSuggestionQueryRef.current === query) {
      suppressSuggestionQueryRef.current = null
      setSuggestions([])
      setShow(false)
      return
    }

    if (query.length < 2) {
      setSuggestions([])
      setShow(false)
      setActiveIndex(-1)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const controller = new AbortController()
        abortRef.current = controller
        const res = await api.search.suggest(query, controller.signal)
        if (requestId !== suggestRequestRef.current) return
        setSuggestions(res.results)
        setShow(true)
        setActiveIndex(-1)
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') setSuggestions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setQuery('')
    setSuggestions([])
    setShow(false)
    setActiveIndex(-1)
  }, [resetToken])

  useEffect(() => {
    suppressSuggestionQueryRef.current = value
    setQuery(value)
    setSuggestions([])
    setShow(false)
    setActiveIndex(-1)
  }, [value])

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
    suggestRequestRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    const suggestion = activeIndex >= 0 ? suggestions[activeIndex] : undefined
    if (suggestion) {
      suppressSuggestionQueryRef.current = suggestion.value
      setQuery(suggestion.value)
    }
    onSearch({ query: suggestion?.value || query, suggestion })
    setSuggestions([])
    setShow(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setShow(true)
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === 'Escape') {
      setShow(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div ref={ref} className="relative">
      <form onSubmit={handleSubmit} className="relative" role="search">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShow(true)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск по кадастровому номеру, адресу, посёлку..."
          aria-label="Поиск по кадастровому номеру, адресу или поселку"
          aria-autocomplete="list"
          aria-controls={suggestionsId}
          aria-expanded={show && suggestions.length > 0}
          role="combobox"
          className="ls-input w-full bg-gray-50 py-2 pl-10 pr-10 text-sm transition-colors focus:bg-white"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setSuggestions([]); setShow(false); setActiveIndex(-1); onSearch({ query: '' }) }}
            aria-label="Очистить поиск"
            title="Очистить поиск"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      {show && suggestions.length > 0 && (
        <div id={suggestionsId} role="listbox" className="ls-panel absolute top-full z-50 mt-1 max-h-80 w-full overflow-y-auto p-1">
          {groupedSuggestions.map(([type, items]) => (
            <div key={type}>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ls-muted)]">
                {type === 'plot' ? 'Участки' : 'Посёлки и населённые пункты'}
              </p>
              {items.map((s) => {
                const index = suggestions.findIndex((item) => item.id === s.id)
                const Icon = s.type === 'plot' ? MapPin : Home
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${activeIndex === index ? 'bg-[#e4f1ec]' : 'hover:bg-gray-50'}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      suppressSuggestionQueryRef.current = s.value
                      setQuery(s.value)
                      setSuggestions([])
                      onSearch({ query: s.value, suggestion: s })
                      setShow(false)
                      setActiveIndex(-1)
                    }}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#eef4f0] text-[var(--ls-green)]"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0"><strong className="block truncate text-xs font-semibold text-[var(--ls-ink)]">{s.label}</strong><span className="block truncate text-[11px] text-[var(--ls-muted)]">{s.value}</span></span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
