'use client'

import { useRef, useState, useCallback, useEffect, useId, useMemo } from 'react'
import { Search, X, ArrowLeft } from 'lucide-react'
import { LogoWordmark } from '@/components/LogoWordmark'
import { findDirectMatchSuggestion } from '@/components/map/searchPillMatch'
import { getSuggestionSubtitle } from '@/components/map/searchPillSuggestionText'
import type { SearchSuggestion } from '@/components/map/searchTypes'
import { cn } from '@/lib/utils'

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
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [searchUnavailable, setSearchUnavailable] = useState(false)
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionRequestIdRef = useRef(0)
  const listboxId = useId()

  const hasSelectedLocation = selectedLocation !== null
  const hasTypedQuery = query.trim().length > 0
  const canShowSuggestions = isOpen && !hasSelectedLocation && query.trim().length >= 3

  const openSearch = useCallback(() => {
    onSearchOpen()
  }, [onSearchOpen])

  const invalidateSuggestionRequests = useCallback(() => {
    suggestionRequestIdRef.current += 1
  }, [])

  const collapseSearch = useCallback(() => {
    invalidateSuggestionRequests()
    setSuggestions([])
    setSearchUnavailable(false)
    setHighlightedSuggestionId(null)
    onSearchCollapse()
  }, [invalidateSuggestionRequests, onSearchCollapse])

  const clearSearch = useCallback(() => {
    invalidateSuggestionRequests()
    setSuggestions([])
    setSearchUnavailable(false)
    setHighlightedSuggestionId(null)
    onSearchClear()
  }, [invalidateSuggestionRequests, onSearchClear])

  const clearTypedQuery = useCallback(() => {
    invalidateSuggestionRequests()
    setSuggestions([])
    setSearchUnavailable(false)
    setHighlightedSuggestionId(null)
    onQueryChange('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [invalidateSuggestionRequests, onQueryChange])

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
      invalidateSuggestionRequests()
      setSuggestions([])
      setSearchUnavailable(false)
      return
    }

    const requestId = ++suggestionRequestIdRef.current
    try {
      const params = new URLSearchParams({ q })
      if (loc) {
        params.set('lat', String(loc[1]))
        params.set('lng', String(loc[0]))
      }

      const response = await fetch(`/api/geocode?${params.toString()}`)
      if (requestId !== suggestionRequestIdRef.current) return

      if (!response.ok) {
        setSuggestions([])
        setSearchUnavailable(true)
        return
      }

      const payload = (await response.json()) as {
        suggestions?: SearchSuggestion[]
        unavailable?: boolean
      }
      if (requestId !== suggestionRequestIdRef.current) return

      setSuggestions(payload.suggestions ?? [])
      setSearchUnavailable(Boolean(payload.unavailable))
    } catch {
      if (requestId !== suggestionRequestIdRef.current) return
      setSuggestions([])
      setSearchUnavailable(true)
    }
  }, [invalidateSuggestionRequests])

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
    invalidateSuggestionRequests()
    setSearchUnavailable(false)
    onQueryChange(e.target.value)
  }, [hasSelectedLocation, invalidateSuggestionRequests, onQueryChange, onSelectedLocationEditStart])

  const handleSelect = useCallback((suggestion: SearchSuggestion) => {
    invalidateSuggestionRequests()
    onQueryChange(suggestion.name)
    setSuggestions([])
    setSearchUnavailable(false)
    setHighlightedSuggestionId(null)
    onLocationSelect(suggestion.lng, suggestion.lat, suggestion.name)
  }, [invalidateSuggestionRequests, onLocationSelect, onQueryChange])

  const visibleSuggestions = useMemo(() => {
    return canShowSuggestions ? suggestions : []
  }, [canShowSuggestions, suggestions])

  const directMatchSuggestion = useMemo(() => {
    return findDirectMatchSuggestion(query, visibleSuggestions)
  }, [query, visibleSuggestions])

  const highlightedSuggestionIndex = useMemo(() => {
    if (!highlightedSuggestionId) return -1

    return visibleSuggestions.findIndex(suggestion => suggestion.id === highlightedSuggestionId)
  }, [highlightedSuggestionId, visibleSuggestions])

  const activeSuggestionIndex =
    highlightedSuggestionIndex >= 0
      ? highlightedSuggestionIndex
      : directMatchSuggestion
        ? visibleSuggestions.findIndex(suggestion => suggestion.id === directMatchSuggestion.id)
        : -1

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visibleSuggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = activeSuggestionIndex >= 0 ? (activeSuggestionIndex + 1) % visibleSuggestions.length : 0
      setHighlightedSuggestionId(visibleSuggestions[nextIndex]?.id ?? null)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const nextIndex =
        activeSuggestionIndex >= 0
          ? (activeSuggestionIndex - 1 + visibleSuggestions.length) % visibleSuggestions.length
          : visibleSuggestions.length - 1
      setHighlightedSuggestionId(visibleSuggestions[nextIndex]?.id ?? null)
      return
    }

    if (e.key !== 'Enter') return

    const directMatch = findDirectMatchSuggestion(query, visibleSuggestions)
    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? visibleSuggestions[activeSuggestionIndex] : directMatch

    if (!selectedSuggestion) return

    e.preventDefault()
    handleSelect(selectedSuggestion)
  }, [activeSuggestionIndex, handleSelect, query, visibleSuggestions])

  const handleClearButtonClick =
    hasSelectedLocation ? clearSearch : hasTypedQuery ? clearTypedQuery : collapseSearch
  const clearButtonLabel = hasSelectedLocation || hasTypedQuery ? 'Clear search' : 'Collapse search'
  const isClearVisible = fullWidth ? (hasSelectedLocation || hasTypedQuery) : isOpen
  const shouldShowDropdown = visibleSuggestions.length > 0 || (canShowSuggestions && searchUnavailable)

  return (
    <div className={cn('relative', fullWidth && 'w-full')}>
      <div className={cn(
        'flex items-center bg-popover/95 backdrop-blur-md shadow-sm border border-border/50 h-11 overflow-hidden transition-shadow duration-200 ease-out',
        fullWidth ? 'w-full rounded-full' : 'rounded-full',
        !isOpen && 'hover:shadow-md hover:bg-popover',
      )}>
        <div
          className={cn(
            'flex items-center shrink-0 overflow-hidden transition-[max-width,opacity] duration-300 ease-out',
            fullWidth && isOpen ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100',
          )}
          aria-hidden={fullWidth && isOpen ? true : undefined}
        >
          <div className="flex items-center pl-4 pr-3 shrink-0">
            <LogoWordmark className="text-[1.55rem]" />
          </div>
          <div className="w-px h-5 bg-foreground/10 shrink-0" />
        </div>

        <button
          onClick={fullWidth && isOpen ? collapseSearch : (isOpen ? undefined : openSearch)}
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
            placeholder="search anywhere…"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={
              activeSuggestionIndex >= 0 ? `${listboxId}-option-${activeSuggestionIndex}` : undefined
            }
            aria-hidden={!fullWidth && !isOpen}
            className={cn(
              'min-w-0 flex-1 bg-transparent outline-none placeholder:font-mono placeholder:text-[13.5px] placeholder:tracking-[0.02em] placeholder:text-muted-foreground/65 text-foreground tracking-tight',
              fullWidth ? 'text-[15px]' : 'text-[14px]',
            )}
            style={fullWidth ? undefined : {
              opacity: isOpen ? 1 : 0,
              transition: 'opacity 150ms ease',
              transitionDelay: isOpen ? '150ms' : '0ms',
            }}
          />

          <button
            onClick={handleClearButtonClick}
            aria-label={clearButtonLabel}
            aria-hidden={!isClearVisible}
            tabIndex={isClearVisible ? 0 : -1}
            disabled={!isClearVisible}
            className="flex items-center justify-center shrink-0 w-9 text-muted-foreground hover:text-foreground"
            style={{
              opacity: isClearVisible ? 1 : 0,
              pointerEvents: isClearVisible ? 'auto' : 'none',
              transition: 'opacity 150ms ease',
              transitionDelay: fullWidth ? '0ms' : (isOpen ? '150ms' : '0ms'),
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {shouldShowDropdown && (
        <div
          id={listboxId}
          role={visibleSuggestions.length > 0 ? 'listbox' : undefined}
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-popover/97 backdrop-blur-md rounded-2xl shadow-xl border border-border/50 overflow-hidden z-50"
        >
          {visibleSuggestions.length > 0 ? (
            visibleSuggestions.map((s, i) => {
              const subtitle = getSuggestionSubtitle(s)

              return (
                <button
                  id={`${listboxId}-option-${i}`}
                  key={s.id}
                  role="option"
                  aria-selected={activeSuggestionIndex === i}
                  onClick={() => handleSelect(s)}
                  onMouseEnter={() => setHighlightedSuggestionId(s.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    activeSuggestionIndex === i ? 'bg-muted/70' : 'hover:bg-muted/60',
                    i < visibleSuggestions.length - 1 && 'border-b border-border/30'
                  )}
                >
                  <p className="font-display text-[1.1rem] leading-[1.15] tracking-[-0.01em] text-foreground">{s.name}</p>
                  {subtitle && (
                    <p className="meta-mono text-[10px] uppercase text-muted-foreground mt-1 truncate">{subtitle}</p>
                  )}
                </button>
              )
            })
          ) : (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="px-4 py-3 text-xs text-muted-foreground font-display italic"
            >
              Search temporarily unavailable
            </p>
          )}
        </div>
      )}
    </div>
  )
}
