'use client'

import { useRef, useState, useCallback, useEffect, useId, useMemo } from 'react'
import { Search, X, ArrowLeft } from 'lucide-react'
import { SearchBoxCore } from '@mapbox/search-js-core'
import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { LogoWordmark } from '@/components/LogoWordmark'
import { cn } from '@/lib/utils'
import { findDirectMatchSuggestion } from './searchPillMatch'
import {
  buildSuggestionFallback,
  mergeSuggestionResults,
  mergeSuggestions,
  resolvePrimaryThenOptionalFallback,
} from './searchPillQuery'
import { getSuggestionSubtitle } from './searchPillSuggestionText'

const SEARCH_TYPES = 'place,poi,neighborhood,address,locality,district,region'
const SUGGESTION_LIMIT = 5

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
  fullWidth?: boolean
}

export function SearchPill({
  fullWidth = false,
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
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null)
  const searchCoreRef = useRef(
    new SearchBoxCore({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '' })
  )
  const sessionTokenRef = useRef(crypto.randomUUID())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionRequestIdRef = useRef(0)
  const listboxId = useId()

  const hasSelectedLocation = selectedLocation !== null
  const canShowSuggestions = isOpen && !hasSelectedLocation && query.trim().length >= 3
  const canRetrieveSuggestion = useCallback((suggestion: SearchBoxSuggestion) => {
    const searchCore = searchCoreRef.current as SearchBoxCore & {
      canRetrieve?: (candidate: SearchBoxSuggestion) => boolean
    }

    return searchCore.canRetrieve ? searchCore.canRetrieve(suggestion) : true
  }, [])

  const openSearch = useCallback(() => {
    onSearchOpen()
  }, [onSearchOpen])

  const collapseSearch = useCallback(() => {
    setSuggestions([])
    setHighlightedSuggestionId(null)
    onSearchCollapse()
  }, [onSearchCollapse])

  const clearSearch = useCallback(() => {
    setSuggestions([])
    setHighlightedSuggestionId(null)
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

    const requestId = ++suggestionRequestIdRef.current
    const fallback = buildSuggestionFallback(q)

    try {
      const requestOptions = {
        sessionToken: sessionTokenRef.current,
        proximity: loc ? { lng: loc[0], lat: loc[1] } : 'ip',
        language: 'en' as const,
        limit: SUGGESTION_LIMIT,
        types: SEARCH_TYPES,
      }
      const primaryPromise = searchCoreRef.current.suggest(q, requestOptions)
      const fallbackPromise = fallback
        ? searchCoreRef.current.suggest(fallback.query, requestOptions)
        : null
      const [primaryResponse, fallbackResponse] = await resolvePrimaryThenOptionalFallback(
        primaryPromise,
        fallbackPromise,
        primaryResult => {
          if (requestId !== suggestionRequestIdRef.current) return
          setSuggestions(primaryResult.suggestions)
        }
      )
      if (requestId !== suggestionRequestIdRef.current) return
      if (!fallbackResponse) return
      setSuggestions(
        fallback
          ? mergeSuggestionResults(
              primaryResponse.suggestions,
              fallbackResponse.suggestions,
              fallback,
              SUGGESTION_LIMIT
            )
          : mergeSuggestions(primaryResponse.suggestions, fallbackResponse.suggestions, SUGGESTION_LIMIT)
      )
    } catch {
      if (requestId !== suggestionRequestIdRef.current) return
      setSuggestions([])
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!canShowSuggestions) return

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query, userLocation)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [canShowSuggestions, fetchSuggestions, query, userLocation])

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
      setHighlightedSuggestionId(null)
      onLocationSelect(lng, lat, suggestion.name)
      sessionTokenRef.current = crypto.randomUUID()
    } catch {}
  }, [onLocationSelect, onQueryChange])

  const visibleSuggestions = useMemo(() => {
    return canShowSuggestions ? suggestions : []
  }, [canShowSuggestions, suggestions])

  const directMatchSuggestion = useMemo(() => {
    return findDirectMatchSuggestion(query, visibleSuggestions)
  }, [query, visibleSuggestions])

  const highlightedSuggestionIndex = useMemo(() => {
    if (!highlightedSuggestionId) return -1

    return visibleSuggestions.findIndex(suggestion => suggestion.mapbox_id === highlightedSuggestionId)
  }, [highlightedSuggestionId, visibleSuggestions])

  const activeSuggestionIndex =
    highlightedSuggestionIndex >= 0
      ? highlightedSuggestionIndex
      : directMatchSuggestion
        ? visibleSuggestions.findIndex(suggestion => suggestion.mapbox_id === directMatchSuggestion.mapbox_id)
        : -1

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visibleSuggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = activeSuggestionIndex >= 0 ? (activeSuggestionIndex + 1) % visibleSuggestions.length : 0
      setHighlightedSuggestionId(visibleSuggestions[nextIndex]?.mapbox_id ?? null)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const nextIndex =
        activeSuggestionIndex >= 0
          ? (activeSuggestionIndex - 1 + visibleSuggestions.length) % visibleSuggestions.length
          : visibleSuggestions.length - 1
      setHighlightedSuggestionId(visibleSuggestions[nextIndex]?.mapbox_id ?? null)
      return
    }

    if (e.key !== 'Enter') return

    const directMatch = findDirectMatchSuggestion(query, visibleSuggestions, canRetrieveSuggestion)
    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? visibleSuggestions[activeSuggestionIndex] : directMatch

    if (!selectedSuggestion || !canRetrieveSuggestion(selectedSuggestion)) return

    e.preventDefault()
    void handleSelect(selectedSuggestion)
  }, [activeSuggestionIndex, canRetrieveSuggestion, handleSelect, query, visibleSuggestions])

  return (
    <div className={cn('relative', fullWidth && 'w-full')}>
      <div className={cn(
        'flex items-center bg-white/90 backdrop-blur-sm shadow border border-white/50 h-10 overflow-hidden',
        fullWidth ? 'w-full rounded-full' : 'rounded-full',
      )}>
        <div className="flex items-center pl-4 pr-3 shrink-0">
          <LogoWordmark className="text-[1.4rem]" />
        </div>

        <div className="w-px h-4 bg-border/40 shrink-0" />

        <button
          onClick={fullWidth && isOpen ? clearSearch : (isOpen ? undefined : openSearch)}
          className={cn(
            'flex items-center justify-center shrink-0',
            fullWidth && isOpen ? 'px-2.5 hover:text-foreground/70' : isOpen ? 'px-2.5 cursor-default' : 'px-3 hover:text-foreground/70'
          )}
          aria-label={fullWidth && isOpen ? 'Go back' : 'Search locations'}
          tabIndex={!fullWidth && isOpen ? -1 : 0}
        >
          {fullWidth && isOpen
            ? <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            : <Search className="w-4 h-4 text-muted-foreground" />
          }
        </button>

        <div
          className="flex items-center min-w-0 overflow-hidden"
          style={fullWidth ? { flex: 1 } : {
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
            onKeyDown={handleInputKeyDown}
            onFocus={fullWidth && !isOpen ? openSearch : undefined}
            placeholder="search anywhere..."
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={
              activeSuggestionIndex >= 0 ? `${listboxId}-option-${activeSuggestionIndex}` : undefined
            }
            aria-hidden={!fullWidth && !isOpen}
            className={cn(
              'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60 text-foreground',
              fullWidth ? 'text-base' : 'text-sm',
            )}
            style={fullWidth ? undefined : {
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
              opacity: fullWidth
                ? (hasSelectedLocation || query.trim() ? 1 : 0)
                : (isOpen ? 1 : 0),
              pointerEvents: fullWidth && !hasSelectedLocation && !query.trim() ? 'none' : 'auto',
              transition: 'opacity 150ms ease',
              transitionDelay: fullWidth ? '0ms' : (isOpen ? '150ms' : '0ms'),
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {visibleSuggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-background/95 backdrop-blur-sm rounded-xl shadow-xl border border-border overflow-hidden z-50"
        >
          {visibleSuggestions.map((s, i) => {
            const subtitle = getSuggestionSubtitle(s)

            return (
              <button
                id={`${listboxId}-option-${i}`}
                key={s.mapbox_id}
                role="option"
                aria-selected={activeSuggestionIndex === i}
                onClick={() => handleSelect(s)}
                onMouseEnter={() => setHighlightedSuggestionId(s.mapbox_id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 transition-colors',
                  activeSuggestionIndex === i ? 'bg-muted' : 'hover:bg-muted',
                  i < visibleSuggestions.length - 1 && 'border-b border-border/40'
                )}
              >
                <p className="text-sm font-semibold leading-snug">{s.name}</p>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
