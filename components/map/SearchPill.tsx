'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { LogoWordmark } from '@/components/LogoWordmark'
import { cn } from '@/lib/utils'

type Suggestion = {
  mapbox_id: string
  name: string
  place_formatted?: string
  full_address?: string
}

type Props = {
  onSearchOpen: () => void
  onSearchClose: () => void
  onLocationSelect: (lng: number, lat: number, name: string) => void
}

export function SearchPill({ onSearchOpen, onSearchClose, onLocationSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const sessionTokenRef = useRef(crypto.randomUUID())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const openSearch = useCallback(() => {
    setIsOpen(true)
    onSearchOpen()
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [onSearchOpen])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSuggestions([])
    onSearchClose()
  }, [onSearchClose])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeSearch()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeSearch])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest')
    url.searchParams.set('q', q)
    url.searchParams.set('access_token', token)
    url.searchParams.set('session_token', sessionTokenRef.current)
    url.searchParams.set('types', 'place,neighborhood,address,locality,district')
    url.searchParams.set('limit', '5')
    try {
      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json() as { suggestions?: Suggestion[] }
      setSuggestions(data.suggestions ?? [])
    } catch { /* network error */ }
  }, [])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }, [fetchSuggestions])

  const handleSelect = useCallback(async (suggestion: Suggestion) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${encodeURIComponent(token)}&session_token=${encodeURIComponent(sessionTokenRef.current)}`
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number] } }> }
      const coords = data.features?.[0]?.geometry?.coordinates
      if (!coords) return
      const [lng, lat] = coords
      setQuery(suggestion.name)
      setSuggestions([])
      onLocationSelect(lng, lat, suggestion.name)
      sessionTokenRef.current = crypto.randomUUID()
      setTimeout(() => closeSearch(), 600)
    } catch { /* network error */ }
  }, [onLocationSelect, closeSearch])

  return (
    <div className="relative">
      {/* Pill */}
      <div
        className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow border border-white/50 h-10 overflow-hidden"
        style={{
          width: isOpen ? '320px' : undefined,
          transition: 'width 300ms ease',
        }}
      >
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

        {/* Input — only mounted/visible when open */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="search anywhere..."
          aria-hidden={!isOpen}
          className={cn(
            'min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 text-foreground transition-[width,opacity] duration-300',
            isOpen ? 'w-full opacity-100' : 'w-0 opacity-0 pointer-events-none'
          )}
        />

        {/* Close button */}
        <button
          onClick={closeSearch}
          aria-label="Close search"
          className={cn(
            'flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-[opacity,width] duration-200',
            isOpen ? 'w-9 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          )}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && suggestions.length > 0 && (
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
              {(s.place_formatted ?? s.full_address) && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {s.place_formatted ?? s.full_address}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
