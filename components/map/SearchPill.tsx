'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { SearchBoxCore } from '@mapbox/search-js-core'
import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { LogoWordmark } from '@/components/LogoWordmark'
import { cn } from '@/lib/utils'

const SEARCH_TYPES = 'place,poi,neighborhood,address,locality,district,region'

type SelectedLocation = {
  lng: number
  lat: number
  name: string
}

type Props = {
  isOpen: boolean
  query: string
  selectedLocation: SelectedLocation | null
  onSearchOpen: () => void
  onSearchCollapse: () => void
  onSearchClear: () => void
  onSelectedLocationEditStart: () => void
  onQueryChange: (query: string) => void
  onLocationSelect: (lng: number, lat: number, name: string) => void
  userLocation: [number, number] | null
}

export function SearchPill({
  isOpen,
  query,
  selectedLocation,
  onSearchOpen,
  onSearchCollapse,
  onSearchClear,
  onSelectedLocationEditStart,
  onQueryChange,
  onLocationSelect,
  userLocation,
}: Props) {
  const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([])
  const searchCoreRef = useRef(
    new SearchBoxCore({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '' })
  )
  const sessionTokenRef = useRef(crypto.randomUUID())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasSelectedLocation = selectedLocation !== null

  const openSearch = useCallback(() => {
    onSearchOpen()
  }, [onSearchOpen])

  const collapseSearch = useCallback(() => {
    setSuggestions([])
    onSearchCollapse()
  }, [onSearchCollapse])

  const clearSearch = useCallback(() => {
    setSuggestions([])
    onSearchClear()
    sessionTokenRef.current = crypto.randomUUID()
  }, [onSearchClear])

  useEffect(() => {
    if (!isOpen || hasSelectedLocation) return
    focusTimeoutRef.current = setTimeout(() => inputRef.current?.focus(), 180)
    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
    }
  }, [hasSelectedLocation, isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) collapseSearch()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, collapseSearch])

  const fetchSuggestions = useCallback(async (q: string, loc: [number, number] | null) => {
    if (q.trim().length < 3) {
      setSuggestions([])
      return
    }

    try {
      const response = await searchCoreRef.current.suggest(q, {
        sessionToken: sessionTokenRef.current,
        proximity: loc ? { lng: loc[0], lat: loc[1] } : 'ip',
        language: 'en',
        limit: 5,
        types: SEARCH_TYPES,
      })
      setSuggestions(response.suggestions)
    } catch { /* network error */ }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!isOpen || hasSelectedLocation) {
      setSuggestions([])
      return
    }

    if (query.trim().length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query, userLocation)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchSuggestions, hasSelectedLocation, isOpen, query, userLocation])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
    }
  }, [])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasSelectedLocation) onSelectedLocationEditStart()
    onQueryChange(e.target.value)
  }, [hasSelectedLocation, onQueryChange, onSelectedLocationEditStart])

  const handleSelect = useCallback(async (suggestion: SearchBoxSuggestion) => {
    try {
      const retrieved = await searchCoreRef.current.retrieve(suggestion, {
        sessionToken: sessionTokenRef.current,
      })
      const coords = retrieved.features[0]?.geometry?.coordinates as [number, number] | undefined
      if (!coords) return
      const [lng, lat] = coords
      onQueryChange(suggestion.name)
      setSuggestions([])
      onLocationSelect(lng, lat, suggestion.name)
      sessionTokenRef.current = crypto.randomUUID()
    } catch { /* network error */ }
  }, [onLocationSelect, onQueryChange])

  return (
    <div className="relative">
      {/* Pill */}
      <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow border border-white/50 h-10 overflow-hidden">
        {/* Logo */}
        <div className="flex items-center pl-4 pr-3 shrink-0">
          <LogoWordmark className="text-[1.4rem]" />
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-border/40 shrink-0" />

        {/* Search icon */}
        <button
          onClick={isOpen ? undefined : openSearch}
          className={cn(
            'flex items-center justify-center shrink-0',
            isOpen ? 'px-2.5 cursor-default' : 'px-3 hover:text-foreground/70'
          )}
          aria-label="Search locations"
          tabIndex={isOpen ? -1 : 0}
        >
          <Search className="w-4 h-4 text-muted-foreground" />
        </button>

        <div
          className="flex items-center min-w-0 overflow-hidden"
          style={{
            maxWidth: isOpen ? '320px' : '0px',
            transition: 'max-width 350ms cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: isOpen ? '0ms' : '150ms',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="search anywhere..."
            aria-hidden={!isOpen}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 text-foreground"
            style={{
              opacity: isOpen ? 1 : 0,
              transition: 'opacity 150ms ease',
              transitionDelay: isOpen ? '150ms' : '0ms',
            }}
          />

          <button
            onClick={hasSelectedLocation ? clearSearch : collapseSearch}
            aria-label={hasSelectedLocation ? 'Clear selected location' : 'Collapse search'}
            className="flex items-center justify-center shrink-0 w-9 text-muted-foreground hover:text-foreground"
            style={{
              opacity: isOpen ? 1 : 0,
              transition: 'opacity 150ms ease',
              transitionDelay: isOpen ? '150ms' : '0ms',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && !hasSelectedLocation && suggestions.length > 0 && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-background/95 backdrop-blur-sm rounded-xl shadow-xl border border-border overflow-hidden z-50">
          {suggestions.map((s, i) => (
            <button
              key={s.mapbox_id}
              onClick={() => handleSelect(s)}
              className={cn(
                'w-full text-left px-4 py-2.5 hover:bg-muted transition-colors',
                i < suggestions.length - 1 && 'border-b border-border/40'
              )}
            >
              <p className="text-sm font-semibold leading-snug">{s.name}</p>
              {s.place_formatted && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.place_formatted}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
