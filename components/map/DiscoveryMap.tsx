'use client'

import type { CSSProperties } from 'react'
import { useRef, useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import {
  ChevronUp,
  ScanSearch,
  MapPinOff,
  X,
  Heart,
  MapPin,
  Star,
  Coffee,
  BookOpen,
  Users,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthControls } from '@/components/auth/AuthControls'
import { NOOK_TYPE_LABELS } from '@/types/nook'
import type { NookPlace, NookType, FilterType } from '@/types/nook'
import { NookDetailPanel } from '@/components/nook/NookDetailPanel'
import { PlacePhotoAttribution } from '@/components/place/PlacePhotoAttribution'
import { SearchPill } from '@/components/map/SearchPill'
import {
  DEFAULT_RADIUS_M,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  formatRadius,
  createCirclePolygon,
  getCircleBounds,
} from '@/components/map/radiusUtils'
import { buildPlacePhotoUrl } from '@/lib/place-photo'

const SRC = 'nooks'
const L_CLUSTERS = 'clusters'
const L_CLUSTER_COUNT = 'cluster-count'

const RADIUS_CIRCLE_SRC = 'radius-circle'
const RADIUS_CIRCLE_FILL = 'radius-circle-fill'
const RADIUS_CIRCLE_LINE = 'radius-circle-line'
// Moss-green hex matching --primary for Mapbox paint properties
const RADIUS_COLOR = '#4a7c3f'

const COLOR_NORMAL = 'oklch(0.42 0.09 145)'
const COLOR_SELECTED = '#c4623a'

const SIDEBAR_BOTTOM_PX = 16
const MAPBOX_LOGO_SAFE_AREA_PX = 16
const PEEK_STRIP_HEIGHT_PX = 72
const PANEL_STACK_GAP_PX = 8

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'cafe', label: 'cafés' },
  { id: 'library', label: 'libraries' },
  { id: 'coworking', label: 'coworking' },
  { id: 'other', label: 'other' },
]

type SearchLocation = {
  lng: number
  lat: number
  name: string
}

type PlacesPanelProps = {
  title: string
  loading: boolean
  places: NookPlace[]
  distanceOrigin: [number, number] | null
  selectedId: string | null
  useMiles: boolean
  radiusM: number
  isRadiusActive: boolean
  onToggleUnit: () => void
  onToggleRadius: () => void
  onRadiusChange: (v: number) => void
  onSelectNook: (nook: NookPlace) => void
}

function getResultsSummary(
  count: number,
  loading: boolean,
  radiusM: number,
  useMiles: boolean,
  isRadiusActive: boolean,
): string {
  if (loading) return 'finding spots…'

  const noun = `${count} spot${count !== 1 ? 's' : ''}`
  return isRadiusActive ? `${noun} within ${formatRadius(radiusM, useMiles)}` : `${noun} nearby`
}

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

function NookTypeIcon({ type, className }: { type: NookType; className?: string }) {
  switch (type) {
    case 'cafe': return <Coffee className={className} />
    case 'library': return <BookOpen className={className} />
    case 'coworking': return <Users className={className} />
    default: return <Building2 className={className} />
  }
}

function setMarkerColor(marker: mapboxgl.Marker, color: string) {
  const path = marker.getElement().querySelector<SVGPathElement>('path')
  if (path) path.style.fill = color
}

function PlacesPanel({
  title,
  loading,
  places,
  distanceOrigin,
  selectedId,
  useMiles,
  radiusM,
  isRadiusActive,
  onToggleUnit,
  onToggleRadius,
  onRadiusChange,
  onSelectNook,
}: PlacesPanelProps) {
  const placesWithDist = places.map(nook => ({
    ...nook,
    dist: distanceOrigin ? distanceM([distanceOrigin[1], distanceOrigin[0]], [nook.lat, nook.lng]) : undefined,
  }))
  const firstPhotoIndex = placesWithDist.findIndex(nook => Boolean(nook.photo))

  const sliderPct = ((radiusM - MIN_RADIUS_M) / (MAX_RADIUS_M - MIN_RADIUS_M)) * 100

  return (
    <>
      <div className="px-4 pt-4 pb-3 shrink-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base truncate">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getResultsSummary(places.length, loading, radiusM, useMiles, isRadiusActive)}
            </p>
          </div>
          {/* Radius toggle + unit toggle */}
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <button
              onClick={onToggleRadius}
              title="Set search radius"
              aria-label="Set search radius"
              aria-pressed={isRadiusActive}
              className={cn(
                'h-[22px] w-[22px] rounded-full flex items-center justify-center border transition-all duration-150',
                isRadiusActive
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground border-border/50 hover:border-border hover:text-foreground',
              )}
            >
              <ScanSearch className="w-3 h-3" />
            </button>
            <button
              onClick={onToggleUnit}
              className="text-xs font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5 hover:bg-muted transition-colors"
            >
              {useMiles ? 'mi' : 'km'}
            </button>
          </div>
        </div>

        {/* Inline radius slider — slides open below the title row */}
        {isRadiusActive && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                Search radius
              </p>
              <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {formatRadius(radiusM, useMiles)}
              </span>
            </div>
            <input
              type="range"
              min={MIN_RADIUS_M}
              max={MAX_RADIUS_M}
              step={100}
              value={radiusM}
              onChange={e => onRadiusChange(Number(e.target.value))}
              className="radius-slider w-full"
              aria-label="Search radius"
              aria-valuetext={formatRadius(radiusM, useMiles)}
              style={{ '--radius-pct': `${sliderPct}%` } as CSSProperties}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground/60">
                {formatRadius(MIN_RADIUS_M, useMiles)}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {formatRadius(MAX_RADIUS_M, useMiles)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2.5">
        {placesWithDist.map((nook, index) => {
          const isSelected = nook.id === selectedId
          const shouldEagerLoadPhoto = nook.photo != null && index === firstPhotoIndex
          return (
            <button
              key={nook.id}
              onClick={() => onSelectNook(nook)}
              className={cn(
                'w-full text-left rounded-xl border overflow-hidden transition-all',
                isSelected
                  ? 'ring-2 ring-primary/30 border-primary/25'
                  : 'bg-card border-border hover:shadow-md',
              )}
            >
              <div className="relative w-full h-[160px] bg-muted">
                <div className="absolute inset-0 flex items-center justify-center">
                  <NookTypeIcon type={nook.type} className="w-8 h-8 text-muted-foreground/25" />
                </div>
                {nook.photo && (
                  <>
                    <Image
                      src={buildPlacePhotoUrl(nook.photo.ref, 640)}
                      alt={nook.name}
                      fill
                      sizes="300px"
                      unoptimized
                      loading={shouldEagerLoadPhoto ? 'eager' : 'lazy'}
                      fetchPriority={shouldEagerLoadPhoto ? 'high' : 'auto'}
                      className="object-cover"
                    />
                    <PlacePhotoAttribution
                      attributions={nook.photo.authorAttributions}
                      linkToSource={false}
                    />
                  </>
                )}
                <span className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-muted-foreground">
                  <Heart className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="p-3">
                <p className="font-semibold text-sm leading-snug">{nook.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{nook.address}</p>

                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {nook.dist != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {formatDist(nook.dist, useMiles)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                    <NookTypeIcon type={nook.type} className="w-3 h-3" />
                    {NOOK_TYPE_LABELS[nook.type]}
                  </span>
                  {nook.rating != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                      <Star className="w-3 h-3" />
                      {nook.rating}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {!loading && places.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 pt-2">
            No spots found. Try a different filter.
          </p>
        )}
      </div>
    </>
  )
}

export function DiscoveryMap({ initialCenter }: { initialCenter: [number, number] }) {
  const searchParams = useSearchParams()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const initialCenterRef = useRef<[number, number]>(initialCenter)
  const mapLoadedRef = useRef(false)
  const realUserLocRef = useRef<[number, number] | null>(null)
  const nearbyOriginRef = useRef<[number, number] | null>(null)
  const selectedSearchLocationRef = useRef<SearchLocation | null>(null)
  const nooksRef = useRef<NookPlace[]>([])
  const pointMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const selectedIdRef = useRef<string | null>(null)
  const primaryColorRef = useRef(COLOR_NORMAL)
  const darkerPrimaryRef = useRef(COLOR_SELECTED)
  const mapSyncModeRef = useRef<'nearby' | 'search' | 'frozen'>('nearby')
  const pendingNookIdRef = useRef<string | null>(searchParams.get('nook'))
  const nearbyRequestIdRef = useRef(0)
  const searchedRequestIdRef = useRef(0)
  const radiusMRef = useRef(DEFAULT_RADIUS_M)
  // Distinguishes auto-trigger on map load from a manual geolocate button press
  const geolocateIsAutoTriggerRef = useRef(false)
  const geoBtnPatchedRef = useRef(false)

  const [nearbyNooks, setNearbyNooks] = useState<NookPlace[]>([])
  const [searchedNooks, setSearchedNooks] = useState<NookPlace[]>([])
  const [mapNooks, setMapNooks] = useState<NookPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailNook, setDetailNook] = useState<NookPlace | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [realUserLoc, setRealUserLoc] = useState<[number, number] | null>(null)
  const [nearbyOrigin, setNearbyOrigin] = useState<[number, number] | null>(null)
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [searchedLoading, setSearchedLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSearchLocation, setSelectedSearchLocation] = useState<SearchLocation | null>(null)
  const [useMiles, setUseMiles] = useState(() => {
    if (typeof navigator === 'undefined') return false
    return navigator.language === 'en-US'
  })
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M)
  const [isRadiusActive, setIsRadiusActive] = useState(false)
  const [showLocDeniedBanner, setShowLocDeniedBanner] = useState(false)
  const [locBannerExiting, setLocBannerExiting] = useState(false)
  const [locBannerShaking, setLocBannerShaking] = useState(false)
  const showLocDeniedBannerRef = useRef(false)
  const triggerBannerAttentionRef = useRef<() => void>(() => {})

  useEffect(() => { showLocDeniedBannerRef.current = showLocDeniedBanner }, [showLocDeniedBanner])

  useEffect(() => {
    triggerBannerAttentionRef.current = () => {
      if (showLocDeniedBannerRef.current) {
        // Banner already visible — shake it to draw attention
        setLocBannerShaking(false)
        requestAnimationFrame(() => setLocBannerShaking(true))
      } else {
        setLocBannerExiting(false)
        setShowLocDeniedBanner(true)
      }
    }
  })

  // Show banner if permission is already denied when the page loads.
  // In-session denials are caught by the geolocate error listener in the map useEffect.
  useEffect(() => {
    if (!navigator.permissions) return
    const dismissed = localStorage.getItem('nook_loc_denied_dismissed') === '1'
    if (dismissed) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then(result => { if (result.state === 'denied') setShowLocDeniedBanner(true) })
      .catch(() => {})
  }, [])

  const fetchPlaces = useCallback(async (lat: number, lng: number, type: FilterType) => {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      type,
      radius: String(radiusMRef.current),
    })
    const res = await fetch(`/api/places?${qs}`)
    if (!res.ok) return []
    const data = (await res.json()) as { places?: NookPlace[] }
    return data.places ?? []
  }, [])

  const clearSelectedNook = useCallback(() => {
    if (selectedIdRef.current) {
      const marker = pointMarkersRef.current.get(selectedIdRef.current)
      if (marker) setMarkerColor(marker, primaryColorRef.current)
    }

    setDetailNook(null)
    setSelectedId(null)
    selectedIdRef.current = null
    window.history.pushState(null, '', '/')
  }, [])

  const invalidateSearchedResults = useCallback(() => {
    searchedRequestIdRef.current += 1
    setSearchedLoading(false)
    setSearchedNooks([])
  }, [])

  const loadNearbyPlaces = useCallback(async (
    coords: [number, number],
    type: FilterType,
    options?: { forceMapUpdate?: boolean; mapTarget?: 'nearby' | 'search'; updateMap?: boolean }
  ) => {
    const requestId = ++nearbyRequestIdRef.current
    setNearbyLoading(true)

    try {
      const places = await fetchPlaces(coords[1], coords[0], type)
      if (requestId !== nearbyRequestIdRef.current) return
      setNearbyNooks(places)
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks(places)
      }
    } catch {
      if (requestId !== nearbyRequestIdRef.current) return
      setNearbyNooks([])
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks([])
      }
    } finally {
      if (requestId === nearbyRequestIdRef.current) setNearbyLoading(false)
    }
  }, [fetchPlaces])

  useEffect(() => {
    selectedSearchLocationRef.current = selectedSearchLocation
  }, [selectedSearchLocation])

  const loadSearchedPlaces = useCallback(async (
    location: SearchLocation,
    type: FilterType,
    options?: { forceMapUpdate?: boolean; mapTarget?: 'nearby' | 'search'; updateMap?: boolean }
  ) => {
    const requestId = ++searchedRequestIdRef.current
    setSearchedLoading(true)

    try {
      const places = await fetchPlaces(location.lat, location.lng, type)
      if (requestId !== searchedRequestIdRef.current) return
      setSearchedNooks(places)
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks(places)
      }
    } catch {
      if (requestId !== searchedRequestIdRef.current) return
      setSearchedNooks([])
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks([])
      }
    } finally {
      if (requestId === searchedRequestIdRef.current) setSearchedLoading(false)
    }
  }, [fetchPlaces])

  const collapseSearch = useCallback(() => {
    setIsSearchOpen(false)
  }, [])

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)

    if (!selectedSearchLocation) return

    mapSyncModeRef.current = 'search'
    setMapNooks(searchedNooks)
  }, [searchedNooks, selectedSearchLocation])

  const clearSearchSelection = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'nearby'
    setMapNooks(nearbyNooks)
    setIsSearchOpen(false)
    setSearchQuery('')
    setSelectedSearchLocation(null)
    invalidateSearchedResults()
  }, [clearSelectedNook, invalidateSearchedResults, nearbyNooks])

  const beginEditingSelectedLocation = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'frozen'
    setSelectedSearchLocation(null)
    invalidateSearchedResults()
  }, [clearSelectedNook, invalidateSearchedResults])

  /**
   * Zoom the map so the radius circle fits comfortably in the viewport.
   * Zoom is clamped between 11 (city scale) and 13 (neighbourhood scale).
   */
  const fitToCircle = useCallback((center: [number, number], radius: number) => {
    const map = mapRef.current
    if (!map) return

    const bounds = getCircleBounds(center, radius)
    // Left panel (300px) + margin pushes the visual centre rightward — compensate with left padding
    const camera = map.cameraForBounds(bounds, {
      padding: { top: 60, bottom: 60, left: 340, right: 60 },
      maxZoom: 13,
    })
    if (!camera) return

    const zoom = Math.max(11, Math.min(13, camera.zoom ?? 12))
    map.easeTo({ center: camera.center ?? center, zoom, duration: 300 })
  }, [])

  /** Synchronously update the radius ref + state and redraw the circle. */
  const handleRadiusChange = useCallback((value: number) => {
    radiusMRef.current = value
    setRadiusM(value)
  }, [])

  const handleToggleRadius = useCallback(() => {
    setIsRadiusActive(prev => !prev)
  }, [])

  const restoreNearbyView = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'nearby'
    setIsSearchOpen(false)

    const target = realUserLocRef.current ?? nearbyOriginRef.current ?? initialCenterRef.current
    if (isRadiusActive) {
      fitToCircle(target, radiusMRef.current)
    } else {
      mapRef.current?.flyTo({ center: target, zoom: 14, duration: 1000 })
    }
    void loadNearbyPlaces(target, filter, {
      forceMapUpdate: true,
      mapTarget: 'nearby',
      updateMap: true,
    })
  }, [clearSelectedNook, filter, fitToCircle, isRadiusActive, loadNearbyPlaces])

  const handleSelectNook = useCallback((nook: NookPlace) => {
    if (selectedIdRef.current && selectedIdRef.current !== nook.id) {
      const prev = pointMarkersRef.current.get(selectedIdRef.current)
      if (prev) setMarkerColor(prev, primaryColorRef.current)
    }

    selectedIdRef.current = nook.id
    setSelectedId(nook.id)

    const marker = pointMarkersRef.current.get(nook.id)
    if (marker) setMarkerColor(marker, darkerPrimaryRef.current)

    mapRef.current?.flyTo({ center: [nook.lng, nook.lat], zoom: 15, speed: 1.8 })
    setDetailNook(nook)
    window.history.pushState(null, '', `/?nook=${encodeURIComponent(nook.id)}`)
  }, [])

  const handlePanelClose = useCallback(() => {
    clearSelectedNook()
  }, [clearSelectedNook])

  const handleLocationSelect = useCallback((lng: number, lat: number, name: string) => {
    clearSelectedNook()
    mapSyncModeRef.current = 'search'

    const location = { lng, lat, name }
    setSearchQuery(name)
    setSelectedSearchLocation(location)
    setIsSearchOpen(true)

    if (isRadiusActive) {
      fitToCircle([lng, lat], radiusMRef.current)
    } else {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 })
    }
    void loadSearchedPlaces(location, filter, { mapTarget: 'search', updateMap: true })
  }, [clearSelectedNook, filter, fitToCircle, isRadiusActive, loadSearchedPlaces])

  const fetchAndOpenNook = useCallback(async (id: string) => {
    try {
      const [detailRes, photoRes] = await Promise.all([
        fetch(`/api/places/${encodeURIComponent(id)}`),
        fetch(`/api/places/${encodeURIComponent(id)}/photo`),
      ])
      if (!detailRes.ok) return
      const raw = await detailRes.json() as {
        displayName?: { text?: string }
        formattedAddress?: string
        addressComponents?: Array<{ longText: string; types: string[] }>
        location?: { latitude: number; longitude: number }
        rating?: number
        types?: string[]
      }
      const photoPayload = photoRes.ok
        ? await photoRes.json() as { photo?: NookPlace['photo'] }
        : { photo: undefined }

      const types = raw.types ?? []
      const nookType: NookType =
        types.some(t => ['cafe', 'coffee_shop'].includes(t)) ? 'cafe' :
        types.includes('library') ? 'library' :
        types.includes('coworking_space') ? 'coworking' : 'other'

      const neighborhood = raw.addressComponents?.find(
        c =>
          c.types.includes('neighborhood') ||
          c.types.includes('sublocality_level_1') ||
          c.types.includes('sublocality')
      )?.longText

      const nook: NookPlace = {
        id,
        name: raw.displayName?.text ?? 'Unknown',
        lat: raw.location?.latitude ?? 0,
        lng: raw.location?.longitude ?? 0,
        address: raw.formattedAddress ?? '',
        neighborhood,
        type: nookType,
        rating: raw.rating,
        workSignals: [],
        photo: photoPayload.photo,
      }

      handleSelectNook(nook)
    } catch {
      // network error
    }
  }, [handleSelectNook])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let cachedCenter: [number, number] | null = null
    try {
      const stored = localStorage.getItem('nook_loc')
      if (stored) {
        const { lng, lat, ts } = JSON.parse(stored) as { lng: number; lat: number; ts: number }
        if (Date.now() - ts < 30 * 24 * 60 * 60 * 1000 && isFinite(lng) && isFinite(lat)) {
          cachedCenter = [lng, lat]
        }
      }
    } catch {}

    const startCenter = cachedCenter ?? initialCenterRef.current
    const startZoom = cachedCenter ? 14 : 10

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: startCenter,
      zoom: startZoom,
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

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      const coords: [number, number] = [e.coords.longitude, e.coords.latitude]

      try {
        localStorage.setItem('nook_loc', JSON.stringify({ lng: coords[0], lat: coords[1], ts: Date.now() }))
      } catch {}

      // Always update location tracking — these drive distance display and restoreNearbyView
      realUserLocRef.current = coords
      nearbyOriginRef.current = coords
      setRealUserLoc(coords)
      setNearbyOrigin(coords)

      // Only move the camera and reload places if GPS puts us somewhere meaningfully different
      // from where we already opened (avoids no-op fly + redundant API call for returning users,
      // and avoids hijacking the camera if the user is already browsing a searched location)
      const movedSignificantly = distanceM(
        [startCenter[1], startCenter[0]],
        [coords[1], coords[0]]
      ) > 200

      if (movedSignificantly) {
        if (mapSyncModeRef.current === 'nearby') {
          map.flyTo({ center: coords, zoom: 14, duration: 1500 })
        }
        void loadNearbyPlaces(coords, 'all', { mapTarget: 'nearby', updateMap: true })
      }
    })

    geolocate.on('error', (e: GeolocationPositionError) => {
      // code 1 = PERMISSION_DENIED
      if (e.code !== 1) return
      const wasAuto = geolocateIsAutoTriggerRef.current
      geolocateIsAutoTriggerRef.current = false

      // Mapbox disables the geolocate button when permission is denied so clicks never fire.
      // Patch it once: remove disabled and wire a click handler that re-shows the banner.
      if (!geoBtnPatchedRef.current) {
        const geoBtn = map
          .getContainer()
          .querySelector('.mapboxgl-ctrl-geolocate') as HTMLButtonElement | null
        if (geoBtn) {
          // Remove the HTML disabled attribute so clicks fire, but keep the
          // visual disabled appearance so it's clear something is wrong
          geoBtn.disabled = false
          geoBtn.style.opacity = '0.5'
          geoBtn.style.cursor = 'pointer'
          geoBtn.addEventListener('click', () => {
            triggerBannerAttentionRef.current()
          })
          geoBtnPatchedRef.current = true
        }
      }

      // Auto-trigger on map load respects the dismissed preference —
      // a manual button press always re-shows the banner so the user knows why it failed
      if (wasAuto) {
        const dismissed = localStorage.getItem('nook_loc_denied_dismissed') === '1'
        if (dismissed) return
      }
      setLocBannerExiting(false)
      setShowLocDeniedBanner(true)
    })

    map.on('load', () => {
      mapLoadedRef.current = true

      const cssVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim()
      if (cssVar) primaryColorRef.current = cssVar

      map.addSource(SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
      })

      map.addLayer({
        id: L_CLUSTERS,
        type: 'circle',
        source: SRC,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4a7c3f',
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 26],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff',
        },
      })

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

      // Radius circle source + layers (drawn below venue markers)
      map.addSource(RADIUS_CIRCLE_SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: RADIUS_CIRCLE_FILL,
        type: 'fill',
        source: RADIUS_CIRCLE_SRC,
        paint: {
          'fill-color': RADIUS_COLOR,
          'fill-opacity': 0.07,
        },
      }, L_CLUSTERS) // insert below cluster layers so markers render on top

      map.addLayer({
        id: RADIUS_CIRCLE_LINE,
        type: 'line',
        source: RADIUS_CIRCLE_SRC,
        paint: {
          'line-color': RADIUS_COLOR,
          'line-width': 1.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.55,
        },
      }, L_CLUSTERS)

      const syncPointMarkers = () => {
        const features = map.querySourceFeatures(SRC, {
          filter: ['!', ['has', 'point_count']],
        })

        const visibleIds = new Set<string>()
        for (const feature of features) {
          const id = String(feature.properties?.id ?? '')
          if (id) visibleIds.add(id)
        }

        pointMarkersRef.current.forEach((marker, id) => {
          if (!visibleIds.has(id)) {
            marker.remove()
            pointMarkersRef.current.delete(id)
          }
        })

        for (const feature of features) {
          const id = String(feature.properties?.id ?? '')
          if (!id || pointMarkersRef.current.has(id)) continue

          const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates
          const color = id === selectedIdRef.current ? darkerPrimaryRef.current : primaryColorRef.current

          const marker = new mapboxgl.Marker({ color })
            .setLngLat(coords)
            .addTo(map)

          marker.getElement().style.cursor = 'pointer'
          marker.getElement().addEventListener('click', () => {
            const clicked = nooksRef.current.find(nook => nook.id === id)
            if (clicked) handleSelectNook(clicked)
          })

          pointMarkersRef.current.set(id, marker)
        }
      }

      map.on('render', () => {
        if (mapLoadedRef.current) syncPointMarkers()
      })

      if (nooksRef.current.length > 0) {
        ;(map.getSource(SRC) as mapboxgl.GeoJSONSource).setData(toGeoJSON(nooksRef.current))
      }

      map.on('click', L_CLUSTERS, e => {
        const feature = e.features?.[0]
        if (!feature) return

        const clusterId = feature.properties?.cluster_id as number
        const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates

        ;(map.getSource(SRC) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId,
          (err, zoom) => {
            if (!err && zoom != null) map.easeTo({ center: coords, zoom })
          }
        )
      })

      map.on('mouseenter', L_CLUSTERS, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', L_CLUSTERS, () => {
        map.getCanvas().style.cursor = ''
      })

      nearbyOriginRef.current = startCenter
      setNearbyOrigin(startCenter)
      void loadNearbyPlaces(startCenter, 'all', { mapTarget: 'nearby', updateMap: true })

      geolocateIsAutoTriggerRef.current = true
      geolocate.trigger()
    })

    mapRef.current = map
    const pointMarkers = pointMarkersRef.current

    return () => {
      pointMarkers.forEach(marker => marker.remove())
      pointMarkers.clear()
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [handleSelectNook, loadNearbyPlaces])

  useEffect(() => {
    nooksRef.current = mapNooks

    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    pointMarkersRef.current.forEach(marker => marker.remove())
    pointMarkersRef.current.clear()

    const pendingId = pendingNookIdRef.current
    if (!pendingId) clearSelectedNook()

    ;(map.getSource(SRC) as mapboxgl.GeoJSONSource)?.setData(toGeoJSON(mapNooks))

    if (!pendingId) return

    pendingNookIdRef.current = null
    const found = mapNooks.find(nook => nook.id === pendingId)
    if (found) {
      handleSelectNook(found)
    } else {
      void fetchAndOpenNook(pendingId)
    }
  }, [clearSelectedNook, fetchAndOpenNook, handleSelectNook, mapNooks])

  useEffect(() => {
    selectedIdRef.current = selectedId
    pointMarkersRef.current.forEach((marker, id) => {
      setMarkerColor(marker, id === selectedId ? darkerPrimaryRef.current : primaryColorRef.current)
    })
  }, [selectedId])

  const isFirstFilterRender = useRef(true)
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false
      return
    }

    const currentNearbyOrigin = nearbyOriginRef.current ?? initialCenterRef.current
    const currentSelectedSearchLocation = selectedSearchLocationRef.current

    void loadNearbyPlaces(currentNearbyOrigin, filter, { mapTarget: 'nearby', updateMap: true })

    if (currentSelectedSearchLocation) {
      void loadSearchedPlaces(currentSelectedSearchLocation, filter, {
        mapTarget: 'search',
        updateMap: true,
      })
    }
  }, [filter, loadNearbyPlaces, loadSearchedPlaces])

  // Draw (or clear) the radius circle on the map whenever active state, radius,
  // or the effective centre changes.
  // Note: centre is computed inside the effect to avoid creating a new array reference
  // on every render (which would cause the effect to re-run unnecessarily).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    const src = map.getSource(RADIUS_CIRCLE_SRC) as mapboxgl.GeoJSONSource | undefined
    if (!src) return

    if (!isRadiusActive) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const center: [number, number] = selectedSearchLocation
      ? [selectedSearchLocation.lng, selectedSearchLocation.lat]
      : (nearbyOrigin ?? initialCenterRef.current)

    src.setData({ type: 'FeatureCollection', features: [createCirclePolygon(center, radiusM)] })
    fitToCircle(center, radiusM)
  }, [isRadiusActive, radiusM, selectedSearchLocation, nearbyOrigin, fitToCircle])

  // Debounced refetch when the slider value settles — only while the selector is open.
  useEffect(() => {
    if (!isRadiusActive) return

    const timer = setTimeout(() => {
      const origin = nearbyOriginRef.current ?? initialCenterRef.current
      void loadNearbyPlaces(origin, filter, {
        mapTarget: 'nearby',
        updateMap: mapSyncModeRef.current === 'nearby',
        forceMapUpdate: mapSyncModeRef.current === 'nearby',
      })
      if (selectedSearchLocationRef.current) {
        void loadSearchedPlaces(selectedSearchLocationRef.current, filter, {
          mapTarget: 'search',
          updateMap: mapSyncModeRef.current === 'search',
          forceMapUpdate: mapSyncModeRef.current === 'search',
        })
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [radiusM, isRadiusActive, filter, loadNearbyPlaces, loadSearchedPlaces])

  const searchBiasLocation = realUserLoc ?? nearbyOrigin
  const leftStackBottomPx = SIDEBAR_BOTTOM_PX + MAPBOX_LOGO_SAFE_AREA_PX
  const nearbyPanelHeight = isSearchOpen
    ? `${PEEK_STRIP_HEIGHT_PX}px`
    : `calc(100vh - 72px - ${leftStackBottomPx}px)`
  const searchPanelBottom = isSearchOpen
    ? `${leftStackBottomPx + PEEK_STRIP_HEIGHT_PX + PANEL_STACK_GAP_PX}px`
    : `${leftStackBottomPx}px`
  const showSearchResultsPanel = isSearchOpen && selectedSearchLocation !== null

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      <div className="absolute top-4 left-4 z-20">
        <SearchPill
          isOpen={isSearchOpen}
          query={searchQuery}
          selectedLocation={selectedSearchLocation}
          onSearchOpen={openSearch}
          onSearchCollapse={collapseSearch}
          onSearchClear={clearSearchSelection}
          onSelectedLocationEditStart={beginEditingSelectedLocation}
          onQueryChange={setSearchQuery}
          onLocationSelect={handleLocationSelect}
          userLocation={searchBiasLocation}
        />
      </div>

      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-nowrap gap-1.5 overflow-x-auto"
        style={{ maxWidth: 'calc(100vw - 360px)' }}
      >
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              if (selectedSearchLocation === null && mapSyncModeRef.current === 'frozen') {
                mapSyncModeRef.current = 'nearby'
              }
              setFilter(id)
            }}
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

      <div className="absolute top-4 right-4 z-10">
        <AuthControls variant="map" />
      </div>

      <div
        className="absolute left-4 z-10 w-[300px] flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden"
        style={{
          bottom: `${leftStackBottomPx}px`,
          height: nearbyPanelHeight,
          transition: 'height 350ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isSearchOpen ? (
          <button
            onClick={restoreNearbyView}
            className="w-full h-[72px] px-4 py-3 text-left shrink-0 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-base leading-none">nooks near you</p>
              <p className="text-xs leading-none text-muted-foreground">
                {getResultsSummary(nearbyNooks.length, nearbyLoading, radiusM, useMiles, isRadiusActive)}
              </p>
            </div>
            <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <ChevronUp className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : (
          <PlacesPanel
            title="nooks near you"
            loading={nearbyLoading}
            places={nearbyNooks}
            distanceOrigin={realUserLoc ?? nearbyOrigin}
            selectedId={selectedId}
            useMiles={useMiles}
            radiusM={radiusM}
            isRadiusActive={isRadiusActive}
            onToggleUnit={() => setUseMiles(value => !value)}
            onToggleRadius={handleToggleRadius}
            onRadiusChange={handleRadiusChange}
            onSelectNook={handleSelectNook}
          />
        )}
      </div>

      {showLocDeniedBanner && (
        <div
          className={cn(
            'absolute top-[60px] left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-md pointer-events-none duration-300',
            locBannerExiting
              ? 'animate-out fade-out slide-out-to-top-2'
              : 'animate-in fade-in slide-in-from-top-2',
          )}
        >
          <div
            className={cn(
              'pointer-events-auto bg-card border border-border/70 rounded-2xl shadow-md px-4 py-3 flex items-center gap-3',
              locBannerShaking && 'banner-shake',
            )}
            onAnimationEnd={() => setLocBannerShaking(false)}
          >
            <div className="shrink-0 rounded-full bg-muted p-1.5">
              <MapPinOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">
                Location access is blocked
              </p>
              <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                Enable it in your browser settings to find nooks near you. You can still search any location.
              </p>
            </div>
            <button
              onClick={() => {
                setLocBannerExiting(true)
                try { localStorage.setItem('nook_loc_denied_dismissed', '1') } catch {}
                setTimeout(() => setShowLocDeniedBanner(false), 300)
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {(detailNook || showSearchResultsPanel) && (
        <div
          className="absolute top-[72px] left-4 z-20 w-[300px] flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden"
          style={{ bottom: searchPanelBottom }}
        >
          {detailNook ? (
            <NookDetailPanel nook={detailNook} onClose={handlePanelClose} />
          ) : selectedSearchLocation ? (
            <PlacesPanel
              title={`nooks near ${selectedSearchLocation.name}`}
              loading={searchedLoading}
              places={searchedNooks}
              distanceOrigin={[selectedSearchLocation.lng, selectedSearchLocation.lat]}
              selectedId={selectedId}
              useMiles={useMiles}
              radiusM={radiusM}
              isRadiusActive={isRadiusActive}
              onToggleUnit={() => setUseMiles(value => !value)}
              onToggleRadius={handleToggleRadius}
              onRadiusChange={handleRadiusChange}
              onSelectNook={handleSelectNook}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
