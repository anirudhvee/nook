'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { NookPlace, FilterType } from '@/types/nook'

// SF as fallback centre
const SF_CENTER: [number, number] = [-122.4194, 37.7749]

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'cafe', label: 'cafés' },
  { id: 'library', label: 'libraries' },
  { id: 'coworking', label: 'coworking' },
  { id: 'other', label: 'other' },
]

// Haversine distance in metres between two [lat, lng] pairs
function distanceM([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

// Creates a teardrop pin SVG element for a Mapbox marker
function makePinEl(selected: boolean): HTMLDivElement {
  const div = document.createElement('div')
  div.style.cssText = 'width:28px;height:36px;cursor:pointer;'
  const fill = selected ? '#2d5016' : '#4a7c3f'
  div.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${fill}"/>
    <circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.75"/>
  </svg>`
  return div
}

function buildPopupHtml(nook: NookPlace): string {
  const sub = [nook.type, nook.neighborhood].filter(Boolean).join(' · ')
  const badges = nook.workSignals
    .map(s => `<span class="nook-popup-badge">${s}</span>`)
    .join('')
  return `
    <div class="nook-popup-inner">
      <p class="nook-popup-name">${nook.name}</p>
      <p class="nook-popup-sub">${sub}</p>
      ${badges ? `<div class="nook-popup-badges">${badges}</div>` : ''}
      <a href="/nook/${nook.id}" class="nook-popup-link">open nook →</a>
    </div>
  `
}

export function DiscoveryMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLDivElement }>>(new Map())
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const userLocRef = useRef<[number, number] | null>(null) // [lng, lat]

  const [nooks, setNooks] = useState<NookPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null) // [lng, lat]
  const [loading, setLoading] = useState(false)

  // ── fetch places ──────────────────────────────────────────────────────────
  const fetchPlaces = useCallback(async (lat: number, lng: number, type: FilterType) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), type })
      const res = await fetch(`/api/places?${qs}`)
      if (!res.ok) return
      const data = (await res.json()) as { places?: NookPlace[] }
      setNooks(data.places ?? [])
    } catch {
      // network error — leave current nooks
    } finally {
      setLoading(false)
    }
  }, [])

  // ── open a popup + fly to nook ────────────────────────────────────────────
  const selectNook = useCallback((nook: NookPlace) => {
    setSelectedId(nook.id)
    const map = mapRef.current
    if (!map) return

    map.flyTo({ center: [nook.lng, nook.lat], zoom: 15, speed: 1.8 })

    popupRef.current?.remove()

    const popup = new mapboxgl.Popup({
      offset: [0, -36],
      closeButton: true,
      closeOnClick: false,
      className: 'nook-popup',
      maxWidth: '260px',
    })
      .setLngLat([nook.lng, nook.lat])
      .setHTML(buildPopupHtml(nook))
      .addTo(map)

    popup.on('close', () => setSelectedId(null))
    popupRef.current = popup
  }, [])

  // ── initialise map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: SF_CENTER,
      zoom: 14,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    })
    map.addControl(geolocate, 'bottom-right')

    map.on('load', () => { geolocate.trigger() })

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      const { latitude, longitude } = e.coords
      userLocRef.current = [longitude, latitude]
      setUserLoc([longitude, latitude])
      fetchPlaces(latitude, longitude, 'all')
    })

    // Geolocation denied / error — fall back to SF
    geolocate.on('error', () => {
      fetchPlaces(SF_CENTER[1], SF_CENTER[0], 'all')
    })

    // If geolocation hasn't fired after 4 s, use SF fallback
    const fallbackTimer = setTimeout(() => {
      if (!userLocRef.current) {
        fetchPlaces(SF_CENTER[1], SF_CENTER[0], 'all')
      }
    }, 4000)

    mapRef.current = map

    return () => {
      clearTimeout(fallbackTimer)
      map.remove()
      mapRef.current = null
    }
  }, [fetchPlaces])

  // ── re-fetch when filter changes (skip initial mount) ─────────────────────
  const isFirstFilterRender = useRef(true)
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false
      return
    }
    const loc = userLocRef.current ?? SF_CENTER
    fetchPlaces(loc[1], loc[0], filter)
  }, [filter, fetchPlaces])

  // ── sync markers when nooks change ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Tear down existing markers and popup
    markersRef.current.forEach(({ marker }) => marker.remove())
    markersRef.current.clear()
    popupRef.current?.remove()
    popupRef.current = null
    setSelectedId(null)

    nooks.forEach(nook => {
      const el = makePinEl(false)
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([nook.lng, nook.lat])
        .addTo(map)

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        selectNook(nook)
      })

      markersRef.current.set(nook.id, { marker, el })
    })
  }, [nooks, selectNook])

  // ── update marker colour when selection changes ───────────────────────────
  useEffect(() => {
    markersRef.current.forEach(({ el }, id) => {
      const path = el.querySelector('path')
      if (path) path.setAttribute('fill', id === selectedId ? '#2d5016' : '#4a7c3f')
    })
  }, [selectedId])

  // ── helpers ───────────────────────────────────────────────────────────────
  const nooksWithDist = nooks.map(n => ({
    ...n,
    dist: userLoc
      ? distanceM([userLoc[1], userLoc[0]], [n.lat, n.lng])
      : undefined,
  }))

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Full-screen map canvas */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* ── nook logo pill — top left ── */}
      <div className="absolute top-4 left-4 z-10">
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow border border-white/50">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="font-semibold text-[15px] tracking-tight">nook</span>
        </div>
      </div>

      {/* ── filter pills — top center ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap gap-2 justify-center"
           style={{ maxWidth: '360px' }}>
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium shadow border transition-colors whitespace-nowrap',
              filter === id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white/90 backdrop-blur-sm text-foreground border-white/50 hover:bg-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── nav pills — top right ── */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Link
          href="/passport"
          className="px-4 py-2 rounded-full text-sm font-medium bg-white/90 backdrop-blur-sm border border-white/50 shadow hover:bg-white transition-colors whitespace-nowrap"
        >
          my passport
        </Link>
        <button className="px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors whitespace-nowrap">
          sign in
        </button>
      </div>

      {/* ── floating sidebar — left ── */}
      <div className="absolute top-[108px] left-4 bottom-4 z-10 w-[300px] flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden">
        {/* header */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <p className="font-semibold text-base">nooks near you</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading
              ? 'finding spots…'
              : `${nooks.length} spot${nooks.length !== 1 ? 's' : ''} within 1.5km`}
          </p>
        </div>

        {/* cards */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {nooksWithDist.map(nook => {
            const isSelected = nook.id === selectedId
            return (
              <button
                key={nook.id}
                onClick={() => selectNook(nook)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors',
                  isSelected
                    ? 'bg-primary/10 border-primary/25'
                    : 'bg-card border-border hover:bg-muted/60'
                )}
              >
                <p className="font-semibold text-sm leading-snug">{nook.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[nook.type, nook.neighborhood, nook.dist != null ? formatDist(nook.dist) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {nook.workSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {nook.workSignals.map(s => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}

          {!loading && nooks.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 pt-2">
              No spots found. Try a different filter or move the map.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
