'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { NookPlace, FilterType } from '@/types/nook'

const SF_CENTER: [number, number] = [-122.4194, 37.7749]
const GEO_TIMEOUT_MS = 8000

// Mapbox source / layer IDs — L_POINTS and L_SELECTED are intentionally absent;
// individual unclustered points are rendered as mapboxgl.Marker instances instead.
const SRC = 'nooks'
const L_CLUSTERS = 'clusters'
const L_CLUSTER_COUNT = 'cluster-count'

// Fallback colors if CSS variable is unavailable
const COLOR_NORMAL  = 'oklch(0.42 0.09 145)'  // --primary light-mode
const COLOR_SELECTED = 'oklch(0.32 0.09 145)' // darker shade for selected

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',       label: 'all' },
  { id: 'cafe',      label: 'cafés' },
  { id: 'library',   label: 'libraries' },
  { id: 'coworking', label: 'coworking' },
  { id: 'other',     label: 'other' },
]

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

function formatDist(m: number, miles: boolean): string {
  if (miles) {
    const mi = m / 1609.34
    return mi < 0.1 ? `${Math.round(m * 3.281)}ft` : `${mi.toFixed(1)}mi`
  }
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

function toGeoJSON(nooks: NookPlace[]) {
  return {
    type: 'FeatureCollection' as const,
    features: nooks.map(n => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [n.lng, n.lat] as [number, number] },
      properties: {
        id: n.id,
        name: n.name,
        nookType: n.type,
        neighborhood: n.neighborhood ?? '',
        workSignals: JSON.stringify(n.workSignals),
        address: n.address,
      },
    })),
  }
}

function buildPopupHtml(props: Record<string, unknown>): string {
  const name = String(props.name ?? '')
  const sub = [props.nookType, props.neighborhood].filter(Boolean).join(' · ')
  const signals: string[] = JSON.parse(String(props.workSignals || '[]'))
  const badges = signals.map(s => `<span class="nook-popup-badge">${s}</span>`).join('')
  return `
    <div class="nook-popup-inner">
      <p class="nook-popup-name">${name}</p>
      <p class="nook-popup-sub">${sub}</p>
      ${badges ? `<div class="nook-popup-badges">${badges}</div>` : ''}
      <a href="/nook/${encodeURIComponent(String(props.id ?? ''))}" class="nook-popup-link">open nook →</a>
    </div>
  `
}

// Update the fill of the default Mapbox Marker SVG path (first path = pin body).
function setMarkerColor(marker: mapboxgl.Marker, color: string) {
  const path = marker.getElement().querySelector<SVGPathElement>('path')
  if (path) path.style.fill = color
}

export function DiscoveryMap() {
  const mapContainerRef   = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<mapboxgl.Map | null>(null)
  const mapLoadedRef      = useRef(false)
  const popupRef          = useRef<mapboxgl.Popup | null>(null)
  const userLocRef        = useRef<[number, number] | null>(null) // [lng, lat]
  const nooksRef          = useRef<NookPlace[]>([])
  const pointMarkersRef   = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const selectedIdRef     = useRef<string | null>(null)
  const primaryColorRef   = useRef(COLOR_NORMAL)
  const darkerPrimaryRef  = useRef(COLOR_SELECTED)

  const [nooks, setNooks]       = useState<NookPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter]     = useState<FilterType>('all')
  const [userLoc, setUserLoc]   = useState<[number, number] | null>(null)
  const [loading, setLoading]   = useState(false)
  const [useMiles, setUseMiles] = useState(() => {
    if (typeof navigator === 'undefined') return false
    return navigator.language === 'en-US'
  })

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchPlaces = useCallback(async (lat: number, lng: number, type: FilterType) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), type })
      const res = await fetch(`/api/places?${qs}`)
      if (!res.ok) return
      const data = (await res.json()) as { places?: NookPlace[] }
      setNooks(data.places ?? [])
    } catch {
      // network error
    } finally {
      setLoading(false)
    }
  }, [])

  // ── open popup ────────────────────────────────────────────────────────────
  const openPopup = useCallback((coords: [number, number], props: Record<string, unknown>) => {
    const map = mapRef.current
    if (!map) return
    popupRef.current?.remove()
    const popup = new mapboxgl.Popup({
      offset: [0, -40],  // offset clears the default marker height
      closeButton: true,
      closeOnClick: false,
      className: 'nook-popup',
      maxWidth: '260px',
    })
      .setLngLat(coords)
      .setHTML(buildPopupHtml(props))
      .addTo(map)
    popup.on('close', () => {
      setSelectedId(null)
      selectedIdRef.current = null
    })
    popupRef.current = popup
  }, [])

  // ── initialise map (runs once) ────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

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

    let geoResolved = false
    let fallbackTimer: ReturnType<typeof setTimeout>

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      geoResolved = true
      clearTimeout(fallbackTimer)
      const { latitude, longitude } = e.coords
      userLocRef.current = [longitude, latitude]
      setUserLoc([longitude, latitude])
      fetchPlaces(latitude, longitude, 'all')
    })

    geolocate.on('error', () => {
      if (geoResolved) return
      geoResolved = true
      clearTimeout(fallbackTimer)
      fetchPlaces(SF_CENTER[1], SF_CENTER[0], 'all')
    })

    map.on('load', () => {
      mapLoadedRef.current = true

      // Read --primary from the computed stylesheet at runtime
      const cssVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim()
      if (cssVar) primaryColorRef.current = cssVar

      // ── GeoJSON source (cluster: true handles grouping) ──
      map.addSource(SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
      })

      // Cluster circles
      map.addLayer({
        id: L_CLUSTERS,
        type: 'circle',
        source: SRC,
        filter: ['has', 'point_count'],
        paint: {
          // Mapbox GL (WebGL) can't parse oklch() — use hex equivalent of --primary
          'circle-color': '#4a7c3f',
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 26],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff',
        },
      })

      // Cluster count labels
      map.addLayer({
        id: L_CLUSTER_COUNT,
        type: 'symbol',
        source: SRC,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#fff' },
      })

      // ── Sync Marker instances to unclustered points on every render ──
      // querySourceFeatures returns only visible, tile-loaded features, so we add/
      // remove markers dynamically as the viewport changes and points un/cluster.
      const syncPointMarkers = () => {
        const features = map.querySourceFeatures(SRC, {
          filter: ['!', ['has', 'point_count']],
        })

        // Deduplicate: querySourceFeatures can return the same feature across tiles
        const visibleIds = new Set<string>()
        for (const f of features) {
          const id = String(f.properties?.id ?? '')
          if (id) visibleIds.add(id)
        }

        // Remove markers that are no longer visible (panned away or now clustered)
        pointMarkersRef.current.forEach((marker, id) => {
          if (!visibleIds.has(id)) {
            marker.remove()
            pointMarkersRef.current.delete(id)
          }
        })

        // Add markers for newly visible points
        for (const f of features) {
          const id = String(f.properties?.id ?? '')
          if (!id || pointMarkersRef.current.has(id)) continue

          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates
          const props  = f.properties as Record<string, unknown>
          const isSelected = id === selectedIdRef.current
          const color  = isSelected ? darkerPrimaryRef.current : primaryColorRef.current

          const marker = new mapboxgl.Marker({ color })
            .setLngLat(coords)
            .addTo(map)

          marker.getElement().style.cursor = 'pointer'

          marker.getElement().addEventListener('click', () => {
            // Deselect previous
            if (selectedIdRef.current && selectedIdRef.current !== id) {
              const prev = pointMarkersRef.current.get(selectedIdRef.current)
              if (prev) setMarkerColor(prev, primaryColorRef.current)
            }

            selectedIdRef.current = id
            setSelectedId(id)
            setMarkerColor(marker, darkerPrimaryRef.current)

            map.flyTo({ center: coords, zoom: 15, speed: 1.8 })
            openPopup(coords, props)
          })

          pointMarkersRef.current.set(id, marker)
        }
      }

      // Use mapLoadedRef rather than isSourceLoaded — the latter can return false
      // during tile fetches on vector sources, causing markers to flicker.
      // For GeoJSON sources mapLoadedRef is the right gate.
      map.on('render', () => {
        if (mapLoadedRef.current) syncPointMarkers()
      })

      // Populate source if nooks arrived before map loaded
      if (nooksRef.current.length > 0) {
        ;(map.getSource(SRC) as mapboxgl.GeoJSONSource).setData(toGeoJSON(nooksRef.current))
      }

      // Click cluster → zoom to expansion zoom
      map.on('click', L_CLUSTERS, e => {
        const feature = e.features?.[0]
        if (!feature) return
        const clusterId = feature.properties?.cluster_id as number
        const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates
        ;(map.getSource(SRC) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId,
          (err, zoom) => { if (!err && zoom != null) map.easeTo({ center: coords, zoom }) }
        )
      })

      map.on('mouseenter', L_CLUSTERS, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', L_CLUSTERS, () => { map.getCanvas().style.cursor = '' })

      geolocate.trigger()
      fallbackTimer = setTimeout(() => {
        if (!geoResolved) { geoResolved = true; fetchPlaces(SF_CENTER[1], SF_CENTER[0], 'all') }
      }, GEO_TIMEOUT_MS)
    })

    mapRef.current = map

    return () => {
      clearTimeout(fallbackTimer)
      pointMarkersRef.current.forEach(m => m.remove())
      pointMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [fetchPlaces, openPopup])

  // ── push nooks to GeoJSON source ──────────────────────────────────────────
  useEffect(() => {
    nooksRef.current = nooks
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    // Clear existing point markers so syncPointMarkers rebuilds them fresh
    pointMarkersRef.current.forEach(m => m.remove())
    pointMarkersRef.current.clear()
    popupRef.current?.remove()
    popupRef.current = null
    setSelectedId(null)
    selectedIdRef.current = null
    ;(map.getSource(SRC) as mapboxgl.GeoJSONSource)?.setData(toGeoJSON(nooks))
  }, [nooks])

  // ── keep selectedIdRef in sync; update marker colors ─────────────────────
  useEffect(() => {
    selectedIdRef.current = selectedId
    pointMarkersRef.current.forEach((marker, id) => {
      setMarkerColor(marker, id === selectedId ? darkerPrimaryRef.current : primaryColorRef.current)
    })
  }, [selectedId])

  // ── re-fetch on filter change (skip mount) ────────────────────────────────
  const isFirstFilterRender = useRef(true)
  useEffect(() => {
    if (isFirstFilterRender.current) { isFirstFilterRender.current = false; return }
    const loc = userLocRef.current ?? SF_CENTER
    fetchPlaces(loc[1], loc[0], filter)
  }, [filter, fetchPlaces])

  const nooksWithDist = nooks.map(n => ({
    ...n,
    dist: userLoc ? distanceM([userLoc[1], userLoc[0]], [n.lat, n.lng]) : undefined,
  }))

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Map — wrapper holds positioning; inner div is Mapbox's container */}
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Logo pill — top left */}
      <div className="absolute top-4 left-4 z-10">
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow border border-white/50">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="font-semibold text-[15px] tracking-tight">nook</span>
        </div>
      </div>

      {/* Filter pills — single row, no wrap */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-nowrap gap-1.5 overflow-x-auto"
        style={{ maxWidth: 'calc(100vw - 360px)' }}
      >
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium shadow border transition-colors whitespace-nowrap shrink-0',
              filter === id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white/90 backdrop-blur-sm text-foreground border-white/50 hover:bg-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Nav pills — top right */}
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

      {/* Sidebar — left */}
      <div className="absolute top-[72px] left-4 bottom-4 z-10 w-[300px] flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden">
        <div className="px-4 pt-4 pb-3 shrink-0 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base">nooks near you</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? 'finding spots…'
                : `${nooks.length} spot${nooks.length !== 1 ? 's' : ''} within 1.5km`}
            </p>
          </div>
          <button
            onClick={() => setUseMiles(v => !v)}
            className="shrink-0 mt-0.5 text-xs font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5 hover:bg-muted transition-colors"
          >
            {useMiles ? 'mi' : 'km'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {nooksWithDist.map(nook => {
            const isSelected = nook.id === selectedId
            return (
              <button
                key={nook.id}
                onClick={() => {
                  // Deselect previous marker
                  if (selectedIdRef.current && selectedIdRef.current !== nook.id) {
                    const prev = pointMarkersRef.current.get(selectedIdRef.current)
                    if (prev) setMarkerColor(prev, primaryColorRef.current)
                  }
                  selectedIdRef.current = nook.id
                  setSelectedId(nook.id)
                  const marker = pointMarkersRef.current.get(nook.id)
                  if (marker) setMarkerColor(marker, darkerPrimaryRef.current)
                  mapRef.current?.flyTo({ center: [nook.lng, nook.lat], zoom: 15, speed: 1.8 })
                  openPopup([nook.lng, nook.lat], {
                    id: nook.id,
                    name: nook.name,
                    nookType: nook.type,
                    neighborhood: nook.neighborhood ?? '',
                    workSignals: JSON.stringify(nook.workSignals),
                  })
                }}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors',
                  isSelected ? 'bg-primary/10 border-primary/25' : 'bg-card border-border hover:bg-muted/60'
                )}
              >
                <p className="font-semibold text-sm leading-snug">{nook.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[nook.type, nook.neighborhood, nook.dist != null ? formatDist(nook.dist, useMiles) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {nook.workSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {nook.workSignals.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
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
              No spots found. Try a different filter.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
