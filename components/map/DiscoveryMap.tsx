'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
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
  Info,
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
import { getNookUrl, getSelectedNookIdFromUrl } from '@/components/map/nookRoute'
import { isPassportPath } from '@/components/map/passportRoute'
import { PassportOverlay, type PassportPin } from '@/components/passport/PassportOverlay'
import { buildPlacePhotoUrl } from '@/lib/place-photo'
import {
  HEADER_H as MOBILE_SHEET_HEADER_H,
  MobileBottomSheet,
  getMobileHalfVisibleHeight,
  type SnapPoint,
} from '@/components/map/MobileBottomSheet'

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
const COLOR_PASSPORT = '#c4623a'

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
  headerAction?: ReactNode
  showUtilityControls?: boolean
  showPeekLift?: boolean
  onPeekLift?: () => void
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
  headerAction,
  showUtilityControls = true,
  showPeekLift = false,
  onPeekLift,
}: PlacesPanelProps) {
  const placesWithDist = places.map(nook => ({
    ...nook,
    dist: distanceOrigin ? distanceM([distanceOrigin[1], distanceOrigin[0]], [nook.lat, nook.lng]) : undefined,
  }))
  const firstPhotoIndex = placesWithDist.findIndex(nook => Boolean(nook.photo))

  const sliderPct = ((radiusM - MIN_RADIUS_M) / (MAX_RADIUS_M - MIN_RADIUS_M)) * 100

  return (
    <>
      <div className="px-4 pt-2 pb-3 shrink-0">
        {showPeekLift && onPeekLift ? (
          <button
            type="button"
            onClick={onPeekLift}
            className="flex w-full items-start justify-between gap-3 text-left transition-colors hover:text-foreground"
          >
            <div className="min-w-0">
              <p className="font-semibold text-base truncate">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getResultsSummary(places.length, loading, radiusM, useMiles, isRadiusActive)}
              </p>
            </div>
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <ChevronUp className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-base truncate">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getResultsSummary(places.length, loading, radiusM, useMiles, isRadiusActive)}
              </p>
            </div>
            {headerAction ?? (
              showUtilityControls ? (
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
              ) : null
            )}
          </div>
        )}

        {!showPeekLift && showUtilityControls && isRadiusActive && (
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
                      compact
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
  const pathname = usePathname()
  const isPassportOpen = isPassportPath(pathname)
  const urlSelectedNookId = getSelectedNookIdFromUrl(pathname)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const initialCenterRef = useRef<[number, number]>(initialCenter)
  const mapLoadedRef = useRef(false)
  const realUserLocRef = useRef<[number, number] | null>(null)
  const nearbyOriginRef = useRef<[number, number] | null>(null)
  const selectedSearchLocationRef = useRef<SearchLocation | null>(null)
  const nooksRef = useRef<NookPlace[]>([])
  const pointMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const passportMarkersRef = useRef<mapboxgl.Marker[]>([])
  const passportRotationRef = useRef<number | null>(null)
  const passportOpenRef = useRef(false)
  const passportCloseHandledRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const detailNookRef = useRef<NookPlace | null>(null)
  const requestedNookIdRef = useRef<string | null>(null)
  const primaryColorRef = useRef(COLOR_NORMAL)
  const darkerPrimaryRef = useRef(COLOR_SELECTED)
  const mapSyncModeRef = useRef<'nearby' | 'search' | 'frozen'>('nearby')
  const nearbyRequestIdRef = useRef(0)
  const searchedRequestIdRef = useRef(0)
  const radiusMRef = useRef(DEFAULT_RADIUS_M)
  const geolocateIsAutoTriggerRef = useRef(false)
  const geoBtnPatchedRef = useRef(false)
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null)
  const attributionControlRef = useRef<mapboxgl.AttributionControl | null>(null)
  const navigationControlRef = useRef<mapboxgl.NavigationControl | null>(null)
  const desktopControlsAddedRef = useRef(false)
  const bannerDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  passportOpenRef.current = isPassportOpen

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
  const [mobileAttributionOpen, setMobileAttributionOpen] = useState(false)
  const [mobileFeedbackHref, setMobileFeedbackHref] = useState('https://apps.mapbox.com/feedback/')
  const showLocDeniedBannerRef = useRef(false)
  const triggerBannerAttentionRef = useRef<() => void>(() => {})

  const [isMobile, setIsMobile] = useState(false)
  const isMobileRef = useRef(false)
  const [mobileSheetSnap, setMobileSheetSnap] = useState<SnapPoint>('half')
  const prevIsMobileRef = useRef(false)

  useEffect(() => { showLocDeniedBannerRef.current = showLocDeniedBanner }, [showLocDeniedBanner])

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = (matches: boolean) => {
      setIsMobile(matches)
      isMobileRef.current = matches
    }
    update(mq.matches)
    const handler = (e: MediaQueryListEvent) => update(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const zeroPad = { top: 0, bottom: 0, left: 0, right: 0 }
    const nextPad = isMobile
      ? {
          top: MOBILE_SHEET_HEADER_H,
          bottom: Math.round(getMobileHalfVisibleHeight(window.innerHeight)),
          left: 0,
          right: 0,
        }
      : zeroPad

    map.setPadding(nextPad)
  }, [isMobile])

  useEffect(() => {
    const map = mapRef.current
    const attribution = attributionControlRef.current
    const navigation = navigationControlRef.current
    const geolocate = geolocateRef.current
    if (!map || !attribution || !navigation || !geolocate) return

    if (isMobile) {
      if (desktopControlsAddedRef.current) {
        map.removeControl(attribution)
        map.removeControl(navigation)
        desktopControlsAddedRef.current = false
      }
      return
    }

    if (!desktopControlsAddedRef.current) {
      map.removeControl(geolocate)
      map.addControl(attribution, 'bottom-right')
      map.addControl(navigation, 'bottom-right')
      map.addControl(geolocate, 'bottom-right')
      desktopControlsAddedRef.current = true
    }
  }, [isMobile])

  useEffect(() => {
    const wasMobile = prevIsMobileRef.current
    prevIsMobileRef.current = isMobile

    if (wasMobile || !isMobile) return

    if (isPassportOpen || detailNook || selectedSearchLocation) {
      setMobileSheetSnap('half')
      return
    }

    setMobileSheetSnap(isSearchOpen ? 'peek' : 'half')
  }, [isMobile, isPassportOpen, detailNook, selectedSearchLocation, isSearchOpen])

  useEffect(() => {
    if (!isMobile) return
    if (isPassportOpen) setMobileSheetSnap('half')
  }, [isPassportOpen, isMobile])

  useEffect(() => {
    if (!isMobile) {
      document.documentElement.style.removeProperty('--mobile-geolocate-bottom')
      document.documentElement.style.removeProperty('--mobile-geolocate-opacity')
      document.documentElement.style.removeProperty('--mobile-geolocate-pointer-events')
      return
    }

    const halfVisibleHeight = Math.round(getMobileHalfVisibleHeight(window.innerHeight))
    const bottom =
      mobileSheetSnap === 'half'
        ? halfVisibleHeight + 8
        : mobileSheetSnap === 'peek'
          ? 88
          : -48

    document.documentElement.style.setProperty('--mobile-geolocate-bottom', `${bottom}px`)
    document.documentElement.style.setProperty('--mobile-geolocate-opacity', mobileSheetSnap === 'full' ? '0' : '1')
    document.documentElement.style.setProperty('--mobile-geolocate-pointer-events', mobileSheetSnap === 'full' ? 'none' : 'auto')

    return () => {
      document.documentElement.style.removeProperty('--mobile-geolocate-bottom')
      document.documentElement.style.removeProperty('--mobile-geolocate-opacity')
      document.documentElement.style.removeProperty('--mobile-geolocate-pointer-events')
    }
  }, [isMobile, mobileSheetSnap])

  useEffect(() => {
    if (!isMobile) return

    const html = document.documentElement
    const body = document.body
    const prevHtmlOverscrollY = html.style.overscrollBehaviorY
    const prevBodyOverscrollY = body.style.overscrollBehaviorY

    html.style.overscrollBehaviorY = 'none'
    body.style.overscrollBehaviorY = 'none'

    return () => {
      html.style.overscrollBehaviorY = prevHtmlOverscrollY
      body.style.overscrollBehaviorY = prevBodyOverscrollY
    }
  }, [isMobile])


  useEffect(() => {
    triggerBannerAttentionRef.current = () => {
      if (bannerDismissTimerRef.current !== null) {
        clearTimeout(bannerDismissTimerRef.current)
        bannerDismissTimerRef.current = null
        setLocBannerExiting(false)
      }
      if (showLocDeniedBannerRef.current) {
        setLocBannerShaking(false)
        requestAnimationFrame(() => setLocBannerShaking(true))
      } else {
        setLocBannerExiting(false)
        setShowLocDeniedBanner(true)
      }
    }
  })

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

  const clearSelectedNookState = useCallback(() => {
    if (selectedIdRef.current) {
      const marker = pointMarkersRef.current.get(selectedIdRef.current)
      if (marker) setMarkerColor(marker, primaryColorRef.current)
    }

    setDetailNook(null)
    setSelectedId(null)
    selectedIdRef.current = null
    detailNookRef.current = null
  }, [])

  const clearSelectedNook = useCallback(() => {
    requestedNookIdRef.current = null
    clearSelectedNookState()
    window.history.replaceState(null, '', '/')
  }, [clearSelectedNookState])

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
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [])

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
    if (isMobileRef.current) setMobileSheetSnap('peek')

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
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [clearSelectedNook, invalidateSearchedResults, nearbyNooks])

  const beginEditingSelectedLocation = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'frozen'
    setSelectedSearchLocation(null)
    invalidateSearchedResults()
  }, [clearSelectedNook, invalidateSearchedResults])

  const fitToCircle = useCallback((center: [number, number], radius: number) => {
    const map = mapRef.current
    if (!map) return

    const bounds = getCircleBounds(center, radius)
    const mobileHalfVisibleHeight = Math.round(getMobileHalfVisibleHeight(window.innerHeight))
    const camera = map.cameraForBounds(bounds, {
      padding: isMobileRef.current
        ? { top: 110, bottom: mobileHalfVisibleHeight + 30, left: 24, right: 24 }
        : { top: 60, bottom: 60, left: 340, right: 60 },
      maxZoom: 13,
    })
    if (!camera) return

    const zoom = Math.max(11, Math.min(13, camera.zoom ?? 12))
    map.easeTo({ center: camera.center ?? center, zoom, duration: 300 })
  }, [])

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

  const applySelectedNook = useCallback((nook: NookPlace) => {
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
    detailNookRef.current = nook
  }, [])

  const handleSelectNook = useCallback((nook: NookPlace) => {
    requestedNookIdRef.current = null
    applySelectedNook(nook)
    window.history.pushState(null, '', getNookUrl(nook.id))
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [applySelectedNook])

  const handlePanelClose = useCallback(() => {
    clearSelectedNook()
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [clearSelectedNook])

  const hideNearbyMarkers = useCallback(() => {
    pointMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = 'none'
    })
    const map = mapRef.current
    if (map?.getLayer(L_CLUSTERS)) map.setLayoutProperty(L_CLUSTERS, 'visibility', 'none')
    if (map?.getLayer(L_CLUSTER_COUNT)) map.setLayoutProperty(L_CLUSTER_COUNT, 'visibility', 'none')
    if (map?.getLayer(RADIUS_CIRCLE_FILL)) map.setLayoutProperty(RADIUS_CIRCLE_FILL, 'visibility', 'none')
    if (map?.getLayer(RADIUS_CIRCLE_LINE)) map.setLayoutProperty(RADIUS_CIRCLE_LINE, 'visibility', 'none')
  }, [])

  const showNearbyMarkers = useCallback(() => {
    pointMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = ''
    })
    const map = mapRef.current
    if (map?.getLayer(L_CLUSTERS)) map.setLayoutProperty(L_CLUSTERS, 'visibility', 'visible')
    if (map?.getLayer(L_CLUSTER_COUNT)) map.setLayoutProperty(L_CLUSTER_COUNT, 'visibility', 'visible')
    if (map?.getLayer(RADIUS_CIRCLE_FILL)) map.setLayoutProperty(RADIUS_CIRCLE_FILL, 'visibility', 'visible')
    if (map?.getLayer(RADIUS_CIRCLE_LINE)) map.setLayoutProperty(RADIUS_CIRCLE_LINE, 'visibility', 'visible')
  }, [])

  const clearPassportMarkers = useCallback(() => {
    for (const m of passportMarkersRef.current) m.remove()
    passportMarkersRef.current = []
  }, [])

  const stopPassportRotation = useCallback(() => {
    if (passportRotationRef.current != null) {
      cancelAnimationFrame(passportRotationRef.current)
      passportRotationRef.current = null
    }
  }, [])

  const handlePassportStampsLoaded = useCallback((pins: PassportPin[]) => {
    const map = mapRef.current
    if (!map) return

    hideNearbyMarkers()
    clearPassportMarkers()
    stopPassportRotation()

    if (pins.length === 0) return

    for (const pin of pins) {
      const marker = new mapboxgl.Marker({ color: COLOR_PASSPORT })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      marker.getElement().style.cursor = 'pointer'
      passportMarkersRef.current.push(marker)
    }

    const bounds = new mapboxgl.LngLatBounds()
    for (const pin of pins) bounds.extend([pin.lng, pin.lat])

    const MOBILE_HEADER_H = MOBILE_SHEET_HEADER_H
    const mobileBottomPad = Math.round(getMobileHalfVisibleHeight(window.innerHeight)) + 10
    const pad = isMobileRef.current
      ? { top: MOBILE_HEADER_H, bottom: mobileBottomPad, left: 20, right: 20 }
      : { top: 80, bottom: 80, left: 340, right: Math.round(window.innerWidth * 0.5) + 40 }

    const naturalCam = map.cameraForBounds(bounds, { padding: { top: 80, bottom: 80, left: 80, right: 80 } })

    if (naturalCam && (naturalCam.zoom ?? 0) >= 1.8) {
      map.fitBounds(bounds, { padding: pad, maxZoom: 13, duration: 1000 })
      return
    }

    const sortedPins = [...pins].sort((a, b) => a.lng - b.lng)
    const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
    const GLOBE_ZOOM = isMobileRef.current ? 0.5 : 1.8
    const DEG_PER_SEC = 18

    const globePadding = isMobileRef.current
      ? { top: MOBILE_HEADER_H, bottom: mobileBottomPad, left: 20, right: 20 }
      : { top: 0, bottom: 0, left: 0, right: Math.round(window.innerWidth * 0.5) }

    map.easeTo({
      center: [sortedPins[0].lng, avgLat],
      zoom: GLOBE_ZOOM,
      padding: globePadding,
      duration: 1200,
    })

    let idx = 0
    let lastTime: number | null = null
    let currentLng = sortedPins[0].lng

    function rotate(timestamp: number) {
      if (!mapRef.current || !passportOpenRef.current) {
        passportRotationRef.current = null
        return
      }

      if (lastTime == null) { lastTime = timestamp }
      const dt = (timestamp - lastTime) / 1000
      lastTime = timestamp

      const targetLng = sortedPins[idx].lng
      const eastward = ((targetLng - currentLng) % 360 + 360) % 360

      if (eastward < 1) {
        idx = (idx + 1) % sortedPins.length
      }

      const step = DEG_PER_SEC * dt
      currentLng += Math.min(step, eastward || step)

      mapRef.current.setCenter([currentLng, avgLat])

      passportRotationRef.current = requestAnimationFrame(rotate)
    }

    map.once('moveend', () => {
      if (!mapRef.current || !passportOpenRef.current) return
      passportRotationRef.current = requestAnimationFrame(rotate)
    })
  }, [clearPassportMarkers, hideNearbyMarkers, stopPassportRotation])

  const handlePassportClose = useCallback(() => {
    window.history.replaceState(null, '', '/')
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [])

  const toggleMobileAttribution = useCallback(() => {
    if (!mobileAttributionOpen) {
      const map = mapRef.current
      if (map) {
        const center = map.getCenter()
        const zoom = map.getZoom()
        setMobileFeedbackHref(
          `https://apps.mapbox.com/feedback/#/${center.lng.toFixed(5)}/${center.lat.toFixed(5)}/${zoom.toFixed(2)}`
        )
      } else {
        setMobileFeedbackHref('https://apps.mapbox.com/feedback/')
      }
    }

    setMobileAttributionOpen(open => !open)
  }, [mobileAttributionOpen])

  const handleLocationSelect = useCallback((lng: number, lat: number, name: string) => {
    const wasPassport = passportOpenRef.current
    if (wasPassport) {
      stopPassportRotation()
      clearPassportMarkers()
      showNearbyMarkers()
      passportCloseHandledRef.current = true
      requestedNookIdRef.current = null
      clearSelectedNookState()
      window.history.replaceState(null, '', '/')
    } else {
      clearSelectedNook()
    }
    mapSyncModeRef.current = 'search'

    const location = { lng, lat, name }
    setSearchQuery(name)
    setSelectedSearchLocation(location)
    setIsSearchOpen(true)
    if (isMobileRef.current) setMobileSheetSnap('half')

    const zeroPad = { top: 0, bottom: 0, left: 0, right: 0 }
    const resetPad = isMobileRef.current
      ? { top: MOBILE_SHEET_HEADER_H, bottom: Math.round(getMobileHalfVisibleHeight(window.innerHeight)), left: 0, right: 0 }
      : zeroPad
    if (isRadiusActive) {
      if (wasPassport) mapRef.current?.setPadding(resetPad)
      fitToCircle([lng, lat], radiusMRef.current)
    } else {
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom: 14,
        duration: 1000,
        ...(wasPassport ? { padding: resetPad } : {}),
      })
    }
    void loadSearchedPlaces(location, filter, { mapTarget: 'search', updateMap: true })
  }, [clearPassportMarkers, clearSelectedNook, clearSelectedNookState, filter, fitToCircle, isRadiusActive, loadSearchedPlaces, showNearbyMarkers, stopPassportRotation])

  const fetchNookById = useCallback(async (id: string): Promise<NookPlace | null> => {
    try {
      const detailRes = await fetch(`/api/places/${encodeURIComponent(id)}`)
      if (!detailRes.ok) return null
      const raw = await detailRes.json() as {
        displayName?: { text?: string }
        formattedAddress?: string
        addressComponents?: Array<{ longText: string; types: string[] }>
        location?: { latitude: number; longitude: number }
        rating?: number
        types?: string[]
      }
      const types = raw.types ?? []
      const nookType: NookType =
        types.some(t => ['cafe', 'coffee_shop'].includes(t)) ? 'cafe' :
        types.includes('library') ? 'library' :
        types.includes('coworking_space') ? 'coworking' : 'other'

      const neighborhood = raw.addressComponents?.find(
        c =>
          c.types?.includes('neighborhood') ||
          c.types?.includes('sublocality_level_1') ||
          c.types?.includes('sublocality')
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
        photo: undefined,
      }

      return nook
    } catch {
      return null
    }
  }, [])

  const syncSelectedNookFromUrl = useCallback((id: string | null) => {
    if (!id) {
      requestedNookIdRef.current = null
      clearSelectedNookState()
      return
    }

    if (selectedIdRef.current === id && detailNookRef.current?.id === id) {
      requestedNookIdRef.current = null
      return
    }

    const found = nooksRef.current.find(nook => nook.id === id)
    if (found) {
      requestedNookIdRef.current = null
      applySelectedNook(found)
      return
    }

    if (requestedNookIdRef.current === id) return

    requestedNookIdRef.current = id
    clearSelectedNookState()
    void fetchNookById(id).then(nook => {
      if (requestedNookIdRef.current !== id) return
      if (!nook) return

      applySelectedNook(nook)
    }).finally(() => {
      if (requestedNookIdRef.current === id) {
        requestedNookIdRef.current = null
      }
    })
  }, [applySelectedNook, clearSelectedNookState, fetchNookById])

  const prevPassportOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = prevPassportOpenRef.current
    prevPassportOpenRef.current = isPassportOpen

    if (wasOpen && !isPassportOpen) {
      if (passportCloseHandledRef.current) {
        passportCloseHandledRef.current = false
        return
      }

      stopPassportRotation()
      clearPassportMarkers()
      showNearbyMarkers()

      const MOBILE_H = MOBILE_SHEET_HEADER_H
      const zeroPad = { top: 0, bottom: 0, left: 0, right: 0 }
      const resetPad = isMobileRef.current
        ? { top: MOBILE_H, bottom: Math.round(getMobileHalfVisibleHeight(window.innerHeight)), left: 0, right: 0 }
        : zeroPad
      mapRef.current?.setPadding(resetPad)
      const searchLoc = selectedSearchLocationRef.current
      if (mapSyncModeRef.current === 'search' && searchLoc) {
        if (isRadiusActive) {
          fitToCircle([searchLoc.lng, searchLoc.lat], radiusMRef.current)
        } else {
          mapRef.current?.flyTo({
            center: [searchLoc.lng, searchLoc.lat],
            zoom: 14,
            duration: 1000,
            padding: resetPad,
          })
        }
      } else {
        const target = realUserLocRef.current ?? nearbyOriginRef.current ?? initialCenterRef.current
        if (isRadiusActive) {
          fitToCircle(target, radiusMRef.current)
        } else {
          mapRef.current?.flyTo({
            center: target,
            zoom: 14,
            duration: 1000,
            padding: resetPad,
          })
        }
      }
    }
  }, [isPassportOpen, stopPassportRotation, clearPassportMarkers, showNearbyMarkers, fitToCircle, isRadiusActive])

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

    const attributionControl = new mapboxgl.AttributionControl({ compact: true })
    attributionControlRef.current = attributionControl
    const navigationControl = new mapboxgl.NavigationControl({ showCompass: false })
    navigationControlRef.current = navigationControl
    if (!isMobileRef.current) {
      map.addControl(attributionControl, 'bottom-right')
      map.addControl(navigationControl, 'bottom-right')
      desktopControlsAddedRef.current = true
    }

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    })
    map.addControl(geolocate, 'bottom-right')
    geolocateRef.current = geolocate

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      geolocateIsAutoTriggerRef.current = false
      const coords: [number, number] = [e.coords.longitude, e.coords.latitude]

      try {
        localStorage.setItem('nook_loc', JSON.stringify({ lng: coords[0], lat: coords[1], ts: Date.now() }))
      } catch {}

      realUserLocRef.current = coords
      nearbyOriginRef.current = coords
      setRealUserLoc(coords)
      setNearbyOrigin(coords)

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
      if (e.code !== 1) return
      const wasAuto = geolocateIsAutoTriggerRef.current
      geolocateIsAutoTriggerRef.current = false

      if (!geoBtnPatchedRef.current) {
        const geoBtn = map
          .getContainer()
          .querySelector('.mapboxgl-ctrl-geolocate') as HTMLButtonElement | null
        if (geoBtn) {
          geoBtn.disabled = false
          geoBtn.style.opacity = '0.5'
          geoBtn.style.cursor = 'pointer'
          geoBtn.addEventListener('click', () => {
            triggerBannerAttentionRef.current()
          })
          geoBtnPatchedRef.current = true
        }
      }

      if (wasAuto) {
        const dismissed = localStorage.getItem('nook_loc_denied_dismissed') === '1'
        if (dismissed) return
      }
      if (bannerDismissTimerRef.current !== null) {
        clearTimeout(bannerDismissTimerRef.current)
        bannerDismissTimerRef.current = null
      }
      setLocBannerExiting(false)
      setShowLocDeniedBanner(true)
    })

    if (isMobileRef.current) {
      const MOBILE_H = MOBILE_SHEET_HEADER_H
      map.setPadding({
        top: MOBILE_H,
        bottom: Math.round(getMobileHalfVisibleHeight(window.innerHeight)),
        left: 0,
        right: 0,
      })
    }

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
      }, L_CLUSTERS)

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
        if (passportOpenRef.current) return
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

    ;(map.getSource(SRC) as mapboxgl.GeoJSONSource)?.setData(toGeoJSON(mapNooks))
    syncSelectedNookFromUrl(urlSelectedNookId)
  }, [mapNooks, syncSelectedNookFromUrl, urlSelectedNookId])

  useEffect(() => {
    if (!mapLoadedRef.current) return
    syncSelectedNookFromUrl(urlSelectedNookId)
  }, [syncSelectedNookFromUrl, urlSelectedNookId])

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
  const nearbyPanelHeight = (isSearchOpen || isPassportOpen)
    ? `${PEEK_STRIP_HEIGHT_PX}px`
    : `calc(100vh - 72px - ${leftStackBottomPx}px)`
  const searchPanelBottom = isSearchOpen
    ? `${leftStackBottomPx + PEEK_STRIP_HEIGHT_PX + PANEL_STACK_GAP_PX}px`
    : `${leftStackBottomPx}px`
  const showSearchResultsPanel = isSearchOpen && selectedSearchLocation !== null

  const mobileSheetContent = isPassportOpen ? 'passport'
    : detailNook ? 'detail'
    : selectedSearchLocation ? 'search'
    : 'nearby'
  const showPeekLift = mobileSheetSnap === 'peek' && mobileSheetContent !== 'passport'

  const handleLiftFromPeek = useCallback(() => {
    if (isSearchOpen && !selectedSearchLocation) {
      collapseSearch()
    }
    setMobileSheetSnap('half')
  }, [collapseSearch, isSearchOpen, selectedSearchLocation])

  const handleMobileSnapChange = useCallback((snap: SnapPoint) => {
    const nextSnap = mobileSheetContent === 'passport' && snap === 'peek' ? 'half' : snap

    if (isSearchOpen && !selectedSearchLocation && mobileSheetSnap === 'peek' && nextSnap !== 'peek') {
      collapseSearch()
    }

    setMobileSheetSnap(nextSnap)
  }, [collapseSearch, isSearchOpen, mobileSheetContent, mobileSheetSnap, selectedSearchLocation])

  return (
    <div className="h-dvh w-screen relative overflow-hidden overscroll-none">
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {isMobile && (
        <>
          <div className="absolute top-0 left-0 right-0 z-30">
            <div className="bg-gradient-to-b from-background/90 via-background/50 to-transparent">
              <div className="flex items-center gap-2 px-3 pt-3 pb-0">
                <div className="flex-1 min-w-0">
                  <SearchPill
                    fullWidth
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
                <AuthControls variant="map" passportIcon />
              </div>

              <div className="flex items-center gap-1.5 px-3 pt-2 pb-2 overflow-x-auto no-scrollbar">
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
                      'px-3 py-1 rounded-full text-sm font-medium border transition-colors whitespace-nowrap shrink-0',
                      filter === id
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-white/90 backdrop-blur-sm text-foreground border-white/50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute bottom-[5px] left-[96px] z-10">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleMobileAttribution}
                aria-label="Map attribution"
                aria-expanded={mobileAttributionOpen}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/90 text-foreground/70 shadow-sm backdrop-blur-sm"
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
              <div
                className={cn(
                  'overflow-hidden rounded-full border border-black/10 bg-white/95 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out',
                  mobileAttributionOpen
                    ? 'max-w-[255px] px-2.5 py-1 opacity-100'
                    : 'max-w-0 px-0 py-0 opacity-0 border-transparent',
                )}
              >
                <div className="flex h-4 items-center gap-2 whitespace-nowrap text-[10px] font-medium leading-none text-muted-foreground">
                  <a
                    href="https://www.mapbox.com/about/maps"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground"
                  >
                    © Mapbox
                  </a>
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground"
                  >
                    © OpenStreetMap
                  </a>
                  <a
                    href={mobileFeedbackHref}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground"
                  >
                    Improve this map
                  </a>
                </div>
              </div>
            </div>
          </div>

          <MobileBottomSheet
            snapPoint={mobileSheetSnap}
            onSnapChange={handleMobileSnapChange}
          >
            {mobileSheetContent === 'passport' && (
              <PassportOverlay
                onClose={handlePassportClose}
                onStampsLoaded={handlePassportStampsLoaded}
                onStampExpand={() => setMobileSheetSnap('full')}
              />
            )}
            {mobileSheetContent === 'detail' && detailNook && (
              <NookDetailPanel
                nook={detailNook}
                onClose={handlePanelClose}
                showPeekLift={showPeekLift}
                onPeekLift={showPeekLift ? handleLiftFromPeek : undefined}
              />
            )}
            {mobileSheetContent === 'search' && selectedSearchLocation && (
              <PlacesPanel
                title={`nooks near ${selectedSearchLocation.name}`}
                loading={searchedLoading}
                places={searchedNooks}
                distanceOrigin={[selectedSearchLocation.lng, selectedSearchLocation.lat]}
                selectedId={selectedId}
                useMiles={useMiles}
                radiusM={radiusM}
                isRadiusActive={isRadiusActive}
                onToggleUnit={() => setUseMiles(v => !v)}
                onToggleRadius={handleToggleRadius}
                onRadiusChange={handleRadiusChange}
                onSelectNook={handleSelectNook}
                showUtilityControls={!showPeekLift}
                showPeekLift={showPeekLift}
                onPeekLift={showPeekLift ? handleLiftFromPeek : undefined}
              />
            )}
            {mobileSheetContent === 'nearby' && (
              <PlacesPanel
                title="nooks near you"
                loading={nearbyLoading}
                places={nearbyNooks}
                distanceOrigin={realUserLoc ?? nearbyOrigin}
                selectedId={selectedId}
                useMiles={useMiles}
                radiusM={radiusM}
                isRadiusActive={isRadiusActive}
                onToggleUnit={() => setUseMiles(v => !v)}
                onToggleRadius={handleToggleRadius}
                onRadiusChange={handleRadiusChange}
                onSelectNook={handleSelectNook}
                showUtilityControls={!showPeekLift}
                showPeekLift={showPeekLift}
                onPeekLift={showPeekLift ? handleLiftFromPeek : undefined}
              />
            )}
          </MobileBottomSheet>
        </>
      )}

      {!isMobile && (
        <>
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

          <div className="absolute top-4 right-4 z-30">
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
            {(isSearchOpen || isPassportOpen) ? (
              <button
                onClick={isPassportOpen ? handlePassportClose : restoreNearbyView}
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

          {!isPassportOpen && (detailNook || showSearchResultsPanel) && (
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

          {isPassportOpen && (
            <div
              className="absolute right-4 top-[72px] z-20 flex flex-col rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg border border-border overflow-hidden"
              style={{
                bottom: `${leftStackBottomPx}px`,
                width: 'calc(50vw - 2rem)',
                minWidth: '320px',
                maxWidth: '640px',
              }}
            >
              <PassportOverlay
                onClose={handlePassportClose}
                onStampsLoaded={handlePassportStampsLoaded}
              />
            </div>
          )}
        </>
      )}

      {showLocDeniedBanner && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-md pointer-events-none duration-300',
            isMobile ? 'top-[108px]' : 'top-[60px]',
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
                bannerDismissTimerRef.current = setTimeout(() => {
                  setShowLocDeniedBanner(false)
                  bannerDismissTimerRef.current = null
                }, 300)
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
