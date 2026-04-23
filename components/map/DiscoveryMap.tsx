'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import {
  ChevronUp,
  ScanSearch,
  MapPinOff,
  X,
  Heart,
  MapPin,
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
import { SearchPill } from '@/components/map/SearchPill'
import {
  DEFAULT_RADIUS_M,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  formatRadius,
  createCirclePolygon,
  getCircleBounds,
} from '@/components/map/radiusUtils'
import {
  getDiscoveryUrl,
  getNookUrl,
  getSearchContextFromParams,
  getSelectedNookSlugFromUrl,
  type NookSearchContext,
} from '@/components/map/nookRoute'
import { isPassportPath } from '@/components/map/passportRoute'
import { PassportOverlay, type PassportPin } from '@/components/passport/PassportOverlay'
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
// Moss-green hex matching --primary for map paint properties
const RADIUS_COLOR = '#4a7c3f'

const COLOR_NORMAL = 'oklch(0.42 0.09 145)'
const COLOR_SELECTED = '#c4623a'
const COLOR_PASSPORT = '#c4623a'

const SIDEBAR_BOTTOM_PX = 16
const MAP_ATTRIBUTION_SAFE_AREA_PX = 16
const PEEK_STRIP_HEIGHT_PX = 72
const PANEL_STACK_GAP_PX = 8
const DEFAULT_MAP_MIN_ZOOM = 1.08
const PASSPORT_PANEL_MARGIN_PX = 16
const PASSPORT_PANEL_GAP_PX = 16
const PASSPORT_PANEL_MIN_WIDTH_PX = 320
const PASSPORT_PANEL_MAX_WIDTH_PX = 640

type GlobeProjectionData = {
  clippingPlane: [number, number, number, number]
  mainMatrix: number[] | Float32Array
}

type MapWithProjectionInternals = maplibregl.Map & {
  transform?: {
    getProjectionDataForCustomLayer?: (renderWorldCopies: boolean) => GlobeProjectionData
    width: number
    height: number
  }
}

declare global {
  interface Window {
    __globeRim?: {
      centerX: number
      centerY: number
      radius: number
      plane: number[]
      normalDotCenter: number
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function getDesktopPassportPanelWidth(viewportWidth: number): number {
  return clamp(
    viewportWidth * 0.5 - PASSPORT_PANEL_MARGIN_PX * 2,
    PASSPORT_PANEL_MIN_WIDTH_PX,
    PASSPORT_PANEL_MAX_WIDTH_PX,
  )
}

function getDesktopPassportRightPadding(viewportWidth: number): number {
  return Math.round(
    getDesktopPassportPanelWidth(viewportWidth) +
    PASSPORT_PANEL_MARGIN_PX +
    PASSPORT_PANEL_GAP_PX,
  )
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalizeVector(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function scaleVector(vector: { x: number; y: number; z: number }, factor: number) {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
    z: vector.z * factor,
  }
}

function addVectors(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }
}

function projectPoint(
  point: { x: number; y: number; z: number },
  matrix: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const clipX = matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12]
  const clipY = matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13]
  const clipW = matrix[3] * point.x + matrix[7] * point.y + matrix[11] * point.z + matrix[15]

  if (!clipW) return null

  const ndcX = clipX / clipW
  const ndcY = clipY / clipW

  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  }
}

function fitCircle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): { x: number; y: number; radius: number } | null {
  const determinant = 2 * (
    a.x * (b.y - c.y) +
    b.x * (c.y - a.y) +
    c.x * (a.y - b.y)
  )

  if (Math.abs(determinant) < 1e-6) return null

  const aSq = a.x * a.x + a.y * a.y
  const bSq = b.x * b.x + b.y * b.y
  const cSq = c.x * c.x + c.y * c.y

  const centerX = (
    aSq * (b.y - c.y) +
    bSq * (c.y - a.y) +
    cSq * (a.y - b.y)
  ) / determinant

  const centerY = (
    aSq * (c.x - b.x) +
    bSq * (a.x - c.x) +
    cSq * (b.x - a.x)
  ) / determinant

  return {
    x: centerX,
    y: centerY,
    radius: Math.hypot(a.x - centerX, a.y - centerY),
  }
}

function syncProjectionDecorations(map: maplibregl.Map, root: HTMLElement) {
  const projectionType = map.getProjection?.()?.type ?? 'globe'
  const isGlobe = projectionType === 'globe'
  document.body.classList.toggle('mercator-mode', !isGlobe)
  if (!isGlobe) {
    root.style.setProperty('--globe-rim-opacity', '0')
  }
}

class ClosedCompactAttributionControl extends maplibregl.AttributionControl {
  private allowOpen = false

  // This intentionally hooks MapLibre internals that are not part of the public API.
  // Re-verify this control against maplibre-gl upgrades before changing versions.
  override _toggleAttribution = () => {
    this.allowOpen = true
    if (this._container.classList.contains('maplibregl-compact')) {
      if (this._container.classList.contains('maplibregl-compact-show')) {
        this._container.setAttribute('open', '')
        this._container.classList.remove('maplibregl-compact-show')
      } else {
        this._container.classList.add('maplibregl-compact-show')
        this._container.removeAttribute('open')
      }
    }
  }

  override _updateCompact = () => {
    if (this._map.getCanvasContainer().offsetWidth <= 640 || this._compact) {
      if (this._compact === false) {
        this._container.setAttribute('open', '')
      } else if (!this._container.classList.contains('maplibregl-compact') && !this._container.classList.contains('maplibregl-attrib-empty')) {
        this._container.setAttribute('open', '')
        this._container.classList.add('maplibregl-compact', 'maplibregl-compact-show')
      }
    } else {
      this._container.setAttribute('open', '')
      if (this._container.classList.contains('maplibregl-compact')) {
        this._container.classList.remove('maplibregl-compact', 'maplibregl-compact-show')
      }
    }

    if (this.allowOpen) return
    if (!this._container.classList.contains('maplibregl-compact')) return
    this._container.classList.remove('maplibregl-compact-show')
    this._container.removeAttribute('open')
  }
}

type GlobeStar = {
  x: number
  y: number
  r: number
  a: number
}

function createGlobeStars(): GlobeStar[] {
  return [
    ...Array.from({ length: 1800 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 0.4 + 0.12,
      a: Math.random() * 0.14 + 0.06,
    })),
    ...Array.from({ length: 220 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 0.7 + 0.24,
      a: Math.random() * 0.22 + 0.14,
    })),
  ]
}

function updateGlobeRim(map: maplibregl.Map, root: HTMLElement) {
  if (map.getProjection?.()?.type !== 'globe') return

  const mapWithInternals = map as MapWithProjectionInternals
  const projectionData = mapWithInternals.transform?.getProjectionDataForCustomLayer?.(true)
  const width = mapWithInternals.transform?.width
  const height = mapWithInternals.transform?.height

  if (!projectionData || !width || !height) return

  const plane = projectionData.clippingPlane
  const normal = normalizeVector({ x: plane[0], y: plane[1], z: plane[2] })
  const center = {
    x: -plane[0] * plane[3],
    y: -plane[1] * plane[3],
    z: -plane[2] * plane[3],
  }
  const radius3d = Math.sqrt(Math.max(0, 1 - plane[3] * plane[3]))
  const axis = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }
  const tangent = normalizeVector(cross(normal, axis))
  const bitangent = normalizeVector(cross(normal, tangent))

  const p1 = projectPoint(addVectors(center, scaleVector(tangent, radius3d)), projectionData.mainMatrix, width, height)
  const p2 = projectPoint(addVectors(center, scaleVector(tangent, -radius3d)), projectionData.mainMatrix, width, height)
  const p3 = projectPoint(addVectors(center, scaleVector(bitangent, radius3d)), projectionData.mainMatrix, width, height)
  const circle = p1 && p2 && p3 ? fitCircle(p1, p2, p3) : null

  if (!circle) return

  const opacity = clamp(0.95 - Math.max(0, map.getZoom() - 2) * 0.17, 0.12, 0.95)

  root.style.setProperty('--globe-rim-center-x', `${circle.x.toFixed(1)}px`)
  root.style.setProperty('--globe-rim-center-y', `${circle.y.toFixed(1)}px`)
  root.style.setProperty('--globe-rim-radius', `${circle.radius.toFixed(1)}px`)
  root.style.setProperty('--globe-rim-opacity', opacity.toFixed(3))

  if (process.env.NODE_ENV === 'development') {
    window.__globeRim = {
      centerX: circle.x,
      centerY: circle.y,
      radius: circle.radius,
      plane: [...plane],
      normalDotCenter: dot(normal, center),
    }
  }
}

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'cafe', label: 'cafés' },
  { id: 'library', label: 'libraries' },
  { id: 'coworking', label: 'coworking' },
  { id: 'other', label: 'other' },
]

type SearchLocation = NookSearchContext

function getSearchLocationKey(location: SearchLocation | null): string | null {
  return location ? `${location.name}|${location.lat}|${location.lng}` : null
}

function readCachedUserLocation(): [number, number] | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem('nook_loc')
    if (!stored) return null

    const parsed = JSON.parse(stored) as { lng: number; lat: number; ts?: number }
    if (!Number.isFinite(parsed.lng) || !Number.isFinite(parsed.lat)) return null
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts >= 30 * 24 * 60 * 60 * 1000) {
      return null
    }

    return [parsed.lng, parsed.lat]
  } catch {
    return null
  }
}

type PlacesPanelProps = {
  title: string
  loading: boolean
  seeding: boolean
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
  seeding: boolean,
  radiusM: number,
  useMiles: boolean,
  isRadiusActive: boolean,
): string {
  if (seeding) return 'Finding nooks in this area...'
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

function formatCardLocation(nook: NookPlace): string | null {
  if (nook.address) return nook.address

  const parts = [nook.city, nook.region, nook.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function toGeoJSON(nooks: NookPlace[]) {
  return {
    type: 'FeatureCollection' as const,
    features: nooks.map(n => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [n.lng, n.lat] as [number, number] },
      properties: {
        id: n.id,
        slug: n.slug,
        name: n.name,
        nookType: n.type,
        address: n.address ?? '',
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

function setMarkerColor(marker: maplibregl.Marker, color: string) {
  const path = marker.getElement().querySelector<SVGPathElement>('path')
  if (path) path.style.fill = color
}

function PlacesPanel({
  title,
  loading,
  seeding,
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
                {getResultsSummary(places.length, loading, seeding, radiusM, useMiles, isRadiusActive)}
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
                {getResultsSummary(places.length, loading, seeding, radiusM, useMiles, isRadiusActive)}
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
        {placesWithDist.map(nook => {
          const isSelected = nook.id === selectedId
          const locationLabel = formatCardLocation(nook)

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
                <span className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-muted-foreground">
                  <Heart className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="p-3">
                <p className="break-words text-sm font-semibold leading-snug">{nook.name}</p>
                {locationLabel && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{locationLabel}</p>
                )}

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
                </div>
              </div>
            </button>
          )
        })}

        {!loading && seeding && places.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 pt-2">
            Finding nooks in this area...
          </p>
        )}

        {!loading && !seeding && places.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 pt-2">
            No spots found. Try a different filter.
          </p>
        )}
      </div>
    </>
  )
}

export function DiscoveryMap({
  initialCenter,
  initialSelectedNook = null,
}: {
  initialCenter: [number, number]
  initialSelectedNook?: NookPlace | null
}) {
  const restoredNearbyOrigin = typeof window === 'undefined'
    ? null
    : readCachedUserLocation()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlSearchLocation = useMemo(
    () => getSearchContextFromParams(searchParams),
    [searchParams],
  )
  const urlSearchLocationKey = getSearchLocationKey(urlSearchLocation)
  const isPassportOpen = isPassportPath(pathname)
  const urlSelectedNookSlug = getSelectedNookSlugFromUrl(pathname)
  const routeBootCenter = useMemo<[number, number] | null>(
    () => initialSelectedNook ? [initialSelectedNook.lng, initialSelectedNook.lat] : null,
    [initialSelectedNook],
  )
  const globeCanvasRef = useRef<HTMLCanvasElement>(null)
  const globeStarsRef = useRef<GlobeStar[]>([])
  if (globeStarsRef.current.length === 0) {
    globeStarsRef.current = createGlobeStars()
  }
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const initialCenterRef = useRef<[number, number]>(restoredNearbyOrigin ?? initialCenter)
  const mapLoadedRef = useRef(false)
  const realUserLocRef = useRef<[number, number] | null>(restoredNearbyOrigin)
  const nearbyOriginRef = useRef<[number, number] | null>(restoredNearbyOrigin)
  const selectedSearchLocationRef = useRef<SearchLocation | null>(urlSearchLocation)
  const nooksRef = useRef<NookPlace[]>([])
  const pointMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const passportMarkersRef = useRef<maplibregl.Marker[]>([])
  const passportRotationRef = useRef<number | null>(null)
  const passportRotationTokenRef = useRef(0)
  const passportOpenRef = useRef(false)
  const passportCloseHandledRef = useRef(false)
  const selectedIdRef = useRef<string | null>(initialSelectedNook?.id ?? null)
  const detailNookRef = useRef<NookPlace | null>(initialSelectedNook)
  const requestedNookIdRef = useRef<string | null>(null)
  const primaryColorRef = useRef(COLOR_NORMAL)
  const darkerPrimaryRef = useRef(COLOR_SELECTED)
  const mapSyncModeRef = useRef<'nearby' | 'search' | 'frozen'>(
    urlSearchLocation ? 'search' : 'nearby',
  )
  const nearbyRequestIdRef = useRef(0)
  const searchedRequestIdRef = useRef(0)
  const hydratedSearchUrlKeyRef = useRef<string | null>(urlSearchLocationKey)
  const previousUrlSelectedNookSlugRef = useRef<string | null>(urlSelectedNookSlug)
  const radiusMRef = useRef(DEFAULT_RADIUS_M)
  const geolocateIsAutoTriggerRef = useRef(false)
  const geoBtnPatchedRef = useRef(false)
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null)
  const attributionControlRef = useRef<maplibregl.AttributionControl | null>(null)
  const navigationControlRef = useRef<maplibregl.NavigationControl | null>(null)
  const mobileAttributionAddedRef = useRef(false)
  const desktopControlsAddedRef = useRef(false)
  const bannerDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  passportOpenRef.current = isPassportOpen

  const [nearbyNooks, setNearbyNooks] = useState<NookPlace[]>([])
  const [searchedNooks, setSearchedNooks] = useState<NookPlace[]>([])
  const [mapNooks, setMapNooks] = useState<NookPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedNook?.id ?? null)
  const [detailNook, setDetailNook] = useState<NookPlace | null>(() => initialSelectedNook)
  const [filter, setFilter] = useState<FilterType>('all')
  const [realUserLoc, setRealUserLoc] = useState<[number, number] | null>(() => restoredNearbyOrigin)
  const [nearbyOrigin, setNearbyOrigin] = useState<[number, number] | null>(() => restoredNearbyOrigin)
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [searchedLoading, setSearchedLoading] = useState(false)
  const [nearbySeeding, setNearbySeeding] = useState(false)
  const [searchedSeeding, setSearchedSeeding] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(urlSearchLocation))
  const [searchQuery, setSearchQuery] = useState(() => urlSearchLocation?.name ?? '')
  const [selectedSearchLocation, setSelectedSearchLocation] = useState<SearchLocation | null>(() => urlSearchLocation)
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

  const [isMobile, setIsMobile] = useState(false)
  const isMobileRef = useRef(false)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [mobileSheetSnap, setMobileSheetSnap] = useState<SnapPoint>('half')
  const prevIsMobileRef = useRef(false)

  useEffect(() => { showLocDeniedBannerRef.current = showLocDeniedBanner }, [showLocDeniedBanner])

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const syncViewportHeight = () => {
      const next = Math.round(window.visualViewport?.height ?? window.innerHeight)
      setViewportHeight(current => current === next ? current : next)
    }
    const update = (matches: boolean) => {
      setIsMobile(matches)
      isMobileRef.current = matches
    }
    update(mq.matches)
    syncViewportHeight()
    const handler = (e: MediaQueryListEvent) => update(e.matches)
    mq.addEventListener('change', handler)
    window.addEventListener('resize', syncViewportHeight)
    window.addEventListener('orientationchange', syncViewportHeight)
    window.visualViewport?.addEventListener('resize', syncViewportHeight)
    return () => {
      mq.removeEventListener('change', handler)
      window.removeEventListener('resize', syncViewportHeight)
      window.removeEventListener('orientationchange', syncViewportHeight)
      window.visualViewport?.removeEventListener('resize', syncViewportHeight)
    }
  }, [])

  const getCurrentViewportHeight = useCallback(() => {
    if (viewportHeight > 0) return viewportHeight
    return Math.round(window.visualViewport?.height ?? window.innerHeight)
  }, [viewportHeight])

  useEffect(() => {
    const canvas = globeCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const drawStars = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      globeStarsRef.current.forEach(star => {
        ctx.beginPath()
        ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226, 233, 240, ${star.a})`
        ctx.fill()
      })
    }

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawStars()
    }

    window.addEventListener('resize', updateCanvasSize)
    updateCanvasSize()

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const zeroPad = { top: 0, bottom: 0, left: 0, right: 0 }
    const currentViewportHeight = getCurrentViewportHeight()
    const nextPad = isMobile
      ? {
          top: MOBILE_SHEET_HEADER_H,
          bottom: Math.round(getMobileHalfVisibleHeight(currentViewportHeight)),
          left: 0,
          right: 0,
        }
      : zeroPad

    map.setPadding(nextPad)
  }, [getCurrentViewportHeight, isMobile])

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
      if (!mobileAttributionAddedRef.current) {
        map.addControl(attribution, 'bottom-left')
        mobileAttributionAddedRef.current = true
      }
      return
    }

    if (mobileAttributionAddedRef.current) {
      map.removeControl(attribution)
      mobileAttributionAddedRef.current = false
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

    const halfVisibleHeight = Math.round(getMobileHalfVisibleHeight(getCurrentViewportHeight()))
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
  }, [getCurrentViewportHeight, isMobile, mobileSheetSnap])

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
    if (!res.ok) return { places: [], seeding: false }
    const data = (await res.json()) as { places?: NookPlace[]; seeding?: boolean }
    return {
      places: data.places ?? [],
      seeding: data.seeding === true,
    }
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
    setSearchedSeeding(false)
    setSearchedNooks([])
  }, [])

  const loadNearbyPlaces = useCallback(async (
    coords: [number, number],
    type: FilterType,
    options?: { forceMapUpdate?: boolean; mapTarget?: 'nearby' | 'search'; updateMap?: boolean }
  ) => {
    const requestId = ++nearbyRequestIdRef.current
    setNearbyLoading(true)
    setNearbySeeding(false)

    try {
      const result = await fetchPlaces(coords[1], coords[0], type)
      if (requestId !== nearbyRequestIdRef.current) return
      const places = result.places
      setNearbyNooks(places)
      setNearbySeeding(result.seeding)
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks(places)
      }
    } catch {
      if (requestId !== nearbyRequestIdRef.current) return
      setNearbyNooks([])
      setNearbySeeding(false)
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
    setSearchedSeeding(false)

    try {
      const result = await fetchPlaces(location.lat, location.lng, type)
      if (requestId !== searchedRequestIdRef.current) return
      const places = result.places
      setSearchedNooks(places)
      setSearchedSeeding(result.seeding)
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks(places)
      }
    } catch {
      if (requestId !== searchedRequestIdRef.current) return
      setSearchedNooks([])
      setSearchedSeeding(false)
      if (options?.forceMapUpdate || (options?.updateMap && mapSyncModeRef.current === options.mapTarget)) {
        setMapNooks([])
      }
    } finally {
      if (requestId === searchedRequestIdRef.current) setSearchedLoading(false)
    }
  }, [fetchPlaces])

  const isSearchRouteActive = useCallback(() => {
    return mapSyncModeRef.current === 'search' && selectedSearchLocationRef.current !== null
  }, [])

  const resolveNearbyRestoreTarget = useCallback((): [number, number] => {
    const restored =
      realUserLocRef.current ??
      nearbyOriginRef.current ??
      readCachedUserLocation() ??
      initialCenterRef.current

    if (!realUserLocRef.current && restored) {
      realUserLocRef.current = restored
      setRealUserLoc(current => current ?? restored)
    }

    if (!nearbyOriginRef.current && restored) {
      nearbyOriginRef.current = restored
      setNearbyOrigin(current => current ?? restored)
    }

    return restored
  }, [])

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

  const beginEditingSelectedLocation = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'frozen'
    selectedSearchLocationRef.current = null
    setSelectedSearchLocation(null)
    invalidateSearchedResults()
  }, [clearSelectedNook, invalidateSearchedResults])

  const fitToCircle = useCallback((center: [number, number], radius: number) => {
    const map = mapRef.current
    if (!map) return

    const bounds = getCircleBounds(center, radius)
    const mobileHalfVisibleHeight = Math.round(getMobileHalfVisibleHeight(getCurrentViewportHeight()))
    const camera = map.cameraForBounds(bounds, {
      padding: isMobileRef.current
        ? { top: 110, bottom: mobileHalfVisibleHeight + 30, left: 24, right: 24 }
        : { top: 60, bottom: 60, left: 340, right: 60 },
      maxZoom: 13,
    })
    if (!camera) return

    const zoom = Math.max(11, Math.min(13, camera.zoom ?? 12))
    map.easeTo({ center: camera.center ?? center, zoom, duration: 300 })
  }, [getCurrentViewportHeight])

  const clearSearchSelection = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'nearby'
    hydratedSearchUrlKeyRef.current = null
    selectedSearchLocationRef.current = null
    setSelectedSearchLocation(null)
    setSearchQuery('')
    setIsSearchOpen(false)
    invalidateSearchedResults()

    const target = resolveNearbyRestoreTarget()
    void loadNearbyPlaces(target, filter, {
      forceMapUpdate: true,
      mapTarget: 'nearby',
      updateMap: true,
    })

    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [clearSelectedNook, filter, invalidateSearchedResults, loadNearbyPlaces, resolveNearbyRestoreTarget])

  useEffect(() => {
    const movedFromSelectedNookToSearch =
      previousUrlSelectedNookSlugRef.current !== null && urlSelectedNookSlug === null
    previousUrlSelectedNookSlugRef.current = urlSelectedNookSlug

    if (!urlSearchLocation || !urlSearchLocationKey) {
      if (hydratedSearchUrlKeyRef.current) {
        hydratedSearchUrlKeyRef.current = null
        selectedSearchLocationRef.current = null
        setSelectedSearchLocation(null)
        setSearchQuery('')
        setIsSearchOpen(false)
        if (mapSyncModeRef.current === 'search') {
          mapSyncModeRef.current = 'nearby'
        }
        const target = resolveNearbyRestoreTarget()
        void loadNearbyPlaces(target, filter, {
          forceMapUpdate: true,
          mapTarget: 'nearby',
          updateMap: true,
        })
      }
      return
    }

    if (
      hydratedSearchUrlKeyRef.current === urlSearchLocationKey &&
      !movedFromSelectedNookToSearch
    ) {
      return
    }

    hydratedSearchUrlKeyRef.current = urlSearchLocationKey
    selectedSearchLocationRef.current = urlSearchLocation
    mapSyncModeRef.current = 'search'
    setSearchQuery(urlSearchLocation.name)
    setSelectedSearchLocation(urlSearchLocation)
    setIsSearchOpen(true)
    if (isMobileRef.current) setMobileSheetSnap('half')

    if (!urlSelectedNookSlug) {
      if (isRadiusActive) {
        fitToCircle([urlSearchLocation.lng, urlSearchLocation.lat], radiusMRef.current)
      } else {
        mapRef.current?.flyTo({
          center: [urlSearchLocation.lng, urlSearchLocation.lat],
          zoom: 14,
          duration: 1000,
        })
      }
    }

    void loadSearchedPlaces(urlSearchLocation, filter, {
      forceMapUpdate: true,
      mapTarget: 'search',
      updateMap: true,
    })
  }, [
    filter,
    fitToCircle,
    isRadiusActive,
    loadSearchedPlaces,
    loadNearbyPlaces,
    resolveNearbyRestoreTarget,
    urlSearchLocation,
    urlSearchLocationKey,
    urlSelectedNookSlug,
  ])

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
    hydratedSearchUrlKeyRef.current = null
    selectedSearchLocationRef.current = null
    setSelectedSearchLocation(null)
    setSearchQuery('')
    setIsSearchOpen(false)
    invalidateSearchedResults()

    const target = resolveNearbyRestoreTarget()
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
  }, [clearSelectedNook, filter, fitToCircle, invalidateSearchedResults, isRadiusActive, loadNearbyPlaces, resolveNearbyRestoreTarget])

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
    const searchLocation = mapSyncModeRef.current === 'search'
      ? selectedSearchLocationRef.current
      : null
    window.history.pushState(null, '', getNookUrl(nook.slug, searchLocation))
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [applySelectedNook])

  const handlePanelClose = useCallback(() => {
    requestedNookIdRef.current = null
    clearSelectedNookState()
    const searchLocation = mapSyncModeRef.current === 'search'
      ? selectedSearchLocationRef.current
      : null
    window.history.replaceState(null, '', getDiscoveryUrl(searchLocation))
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [clearSelectedNookState])

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
    passportRotationTokenRef.current += 1
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
      const marker = new maplibregl.Marker({ color: COLOR_PASSPORT })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      marker.getElement().style.cursor = 'pointer'
      passportMarkersRef.current.push(marker)
    }

    const MOBILE_HEADER_H = MOBILE_SHEET_HEADER_H
    const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
    const GLOBE_ZOOM = isMobileRef.current ? DEFAULT_MAP_MIN_ZOOM : 1.8
    const DEG_PER_SEC = 18

    const getPassportGlobePadding = () => {
      if (isMobileRef.current) {
        return {
          top: MOBILE_HEADER_H,
          bottom: Math.round(getMobileHalfVisibleHeight(getCurrentViewportHeight())) + 10,
          left: 20,
          right: 20,
        }
      }

      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: getDesktopPassportRightPadding(window.innerWidth),
      }
    }

    const rotationToken = passportRotationTokenRef.current + 1
    passportRotationTokenRef.current = rotationToken
    let currentLng = wrapLng(pins[0].lng)
    let lastTime: number | null = null

    function rotate(timestamp: number) {
      const activeMap = mapRef.current
      if (
        !activeMap ||
        !passportOpenRef.current ||
        passportRotationTokenRef.current !== rotationToken
      ) {
        passportRotationRef.current = null
        return
      }

      if (lastTime == null) lastTime = timestamp
      const dt = Math.min((timestamp - lastTime) / 1000, 0.1)
      lastTime = timestamp
      currentLng = wrapLng(currentLng + DEG_PER_SEC * dt)

      activeMap.jumpTo({
        center: [currentLng, avgLat],
        zoom: GLOBE_ZOOM,
        padding: getPassportGlobePadding(),
      })
      passportRotationRef.current = requestAnimationFrame(rotate)
    }

    let rotationStarted = false
    const startRotation = () => {
      map.off('moveend', startRotation)
      if (
        rotationStarted ||
        !mapRef.current ||
        !passportOpenRef.current ||
        passportRotationTokenRef.current !== rotationToken
      ) {
        return
      }

      rotationStarted = true
      lastTime = null
      passportRotationRef.current = requestAnimationFrame(rotate)
    }

    map.once('moveend', startRotation)
    map.easeTo({
      center: [currentLng, avgLat],
      zoom: GLOBE_ZOOM,
      padding: getPassportGlobePadding(),
      duration: 1200,
      essential: true,
    })

    if (!map.isMoving()) startRotation()
  }, [clearPassportMarkers, getCurrentViewportHeight, hideNearbyMarkers, stopPassportRotation])

  const handlePassportClose = useCallback(() => {
    window.history.replaceState(null, '', '/')
    if (isMobileRef.current) setMobileSheetSnap('half')
  }, [])

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
    hydratedSearchUrlKeyRef.current = getSearchLocationKey(location)
    selectedSearchLocationRef.current = location
    setSearchQuery(name)
    setSelectedSearchLocation(location)
    setIsSearchOpen(true)
    window.history.replaceState(null, '', getDiscoveryUrl(location))
    if (isMobileRef.current) setMobileSheetSnap('half')

    const zeroPad = { top: 0, bottom: 0, left: 0, right: 0 }
    const resetPad = isMobileRef.current
      ? { top: MOBILE_SHEET_HEADER_H, bottom: Math.round(getMobileHalfVisibleHeight(getCurrentViewportHeight())), left: 0, right: 0 }
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
  }, [clearPassportMarkers, clearSelectedNook, clearSelectedNookState, filter, fitToCircle, getCurrentViewportHeight, isRadiusActive, loadSearchedPlaces, showNearbyMarkers, stopPassportRotation])

  const fetchNookBySlug = useCallback(async (slug: string): Promise<NookPlace | null> => {
    try {
      const detailRes = await fetch(`/api/places/${encodeURIComponent(slug)}`)
      if (!detailRes.ok) return null
      const raw = await detailRes.json() as Partial<NookPlace>
      if (!raw.id || !raw.slug || !raw.name || raw.lat == null || raw.lng == null) return null

      return {
        id: raw.id,
        slug: raw.slug,
        overture_id: raw.overture_id ?? '',
        name: raw.name,
        lat: raw.lat,
        lng: raw.lng,
        address: raw.address ?? null,
        type: raw.type ?? 'other',
        city: raw.city ?? null,
        region: raw.region ?? null,
        country: raw.country ?? null,
        website: raw.website ?? null,
        phone: raw.phone ?? null,
        operating_status: raw.operating_status ?? 'active',
        seed_run_id: raw.seed_run_id ?? null,
      }
    } catch {
      return null
    }
  }, [])

  const syncSelectedNookFromUrl = useCallback((slug: string | null) => {
    if (!slug) {
      requestedNookIdRef.current = null
      clearSelectedNookState()
      return
    }

    if (detailNookRef.current?.slug === slug) {
      requestedNookIdRef.current = null
      const restoredNook = detailNookRef.current
      const map = mapRef.current
      if (restoredNook && map && mapLoadedRef.current) {
        const center = map.getCenter()
        const centerDistance = distanceM(
          [center.lat, center.lng],
          [restoredNook.lat, restoredNook.lng],
        )
        if (centerDistance > 50 || map.getZoom() < 14.5) {
          map.flyTo({
            center: [restoredNook.lng, restoredNook.lat],
            zoom: 15,
            speed: 1.8,
          })
        }
      }
      return
    }

    const found = nooksRef.current.find(nook => nook.slug === slug)
    if (found) {
      requestedNookIdRef.current = null
      applySelectedNook(found)
      return
    }

    if (requestedNookIdRef.current === slug) return

    requestedNookIdRef.current = slug
    clearSelectedNookState()
    void fetchNookBySlug(slug).then(nook => {
      if (requestedNookIdRef.current !== slug) return
      if (!nook) return

      applySelectedNook(nook)
    }).finally(() => {
      if (requestedNookIdRef.current === slug) {
        requestedNookIdRef.current = null
      }
    })
  }, [applySelectedNook, clearSelectedNookState, fetchNookBySlug])

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
        ? { top: MOBILE_H, bottom: Math.round(getMobileHalfVisibleHeight(getCurrentViewportHeight())), left: 0, right: 0 }
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
        const target = resolveNearbyRestoreTarget()
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
  }, [getCurrentViewportHeight, isPassportOpen, stopPassportRotation, clearPassportMarkers, showNearbyMarkers, fitToCircle, isRadiusActive, resolveNearbyRestoreTarget])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const cachedCenter = readCachedUserLocation()
    const nearbyBaseCenter = cachedCenter ?? initialCenterRef.current
    const searchBootCenter: [number, number] | null = urlSearchLocation
      ? [urlSearchLocation.lng, urlSearchLocation.lat]
      : null
    const startCenter = routeBootCenter ?? searchBootCenter ?? nearbyBaseCenter
    const startZoom = routeBootCenter ? 15 : (searchBootCenter || cachedCenter ? 14 : 10)
    initialCenterRef.current = nearbyBaseCenter

    const root = document.documentElement
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: '/map-style.json',
      center: startCenter,
      zoom: startZoom,
      minZoom: DEFAULT_MAP_MIN_ZOOM,
      maxPitch: 0,
      attributionControl: false,
    })
    map.on('error', event => {
      const message = event.error?.message
      if (message) console.warn(message)
    })
    map.on('styleimagemissing', event => {
      if (!event.id || map.hasImage(event.id)) return
      map.addImage(event.id, {
        width: 1,
        height: 1,
        data: new Uint8Array([0, 0, 0, 0]),
      })
    })
    const initialViewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight)

    const handleStyleData = () => {
      syncProjectionDecorations(map, root)
    }

    const attributionControl = new ClosedCompactAttributionControl({ compact: true })
    attributionControlRef.current = attributionControl
    const navigationControl = new maplibregl.NavigationControl({ showCompass: false })
    navigationControlRef.current = navigationControl
    if (isMobileRef.current) {
      map.addControl(attributionControl, 'bottom-left')
      mobileAttributionAddedRef.current = true
    } else {
      map.addControl(attributionControl, 'bottom-right')
      map.addControl(navigationControl, 'bottom-right')
      desktopControlsAddedRef.current = true
    }
    const geolocate = new maplibregl.GeolocateControl({
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
        [nearbyBaseCenter[1], nearbyBaseCenter[0]],
        [coords[1], coords[0]]
      ) > 200

      if (movedSignificantly && mapSyncModeRef.current === 'nearby') {
        map.flyTo({ center: coords, zoom: 14, duration: 1500 })
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
          .querySelector('.maplibregl-ctrl-geolocate') as HTMLButtonElement | null
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
        bottom: Math.round(getMobileHalfVisibleHeight(initialViewportHeight)),
        left: 0,
        right: 0,
      })
    }

    map.on('load', () => {
      mapLoadedRef.current = true
      map.setProjection({ type: 'globe' })
      map.setSky({ 'atmosphere-blend': 0 })
      syncProjectionDecorations(map, root)
      updateGlobeRim(map, root)

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
          'text-font': ['Noto Sans Regular'],
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

          const marker = new maplibregl.Marker({ color })
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
        updateGlobeRim(map, root)
        if (mapLoadedRef.current) syncPointMarkers()
      })
      map.on('styledata', handleStyleData)

      if (nooksRef.current.length > 0) {
        ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData(toGeoJSON(nooksRef.current))
      }

      map.on('click', L_CLUSTERS, e => {
        const feature = e.features?.[0]
        if (!feature) return

        const clusterId = feature.properties?.cluster_id as number
        const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates

        void (map.getSource(SRC) as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(clusterId)
          .then(zoom => {
            map.easeTo({ center: coords, zoom })
          })
          .catch(() => {})
      })

      map.on('mouseenter', L_CLUSTERS, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', L_CLUSTERS, () => {
        map.getCanvas().style.cursor = ''
      })

      nearbyOriginRef.current = nearbyBaseCenter
      setNearbyOrigin(nearbyBaseCenter)
      const activeSearchLocation = selectedSearchLocationRef.current
      if (activeSearchLocation && isSearchRouteActive()) {
        void loadSearchedPlaces(activeSearchLocation, 'all', {
          forceMapUpdate: true,
          mapTarget: 'search',
          updateMap: true,
        })
      } else {
        void loadNearbyPlaces(startCenter, 'all', { mapTarget: 'nearby', updateMap: true })
      }

      if (activeSearchLocation && isSearchRouteActive()) {
        geolocateIsAutoTriggerRef.current = false
      } else {
        geolocateIsAutoTriggerRef.current = true
        geolocate.trigger()
      }
    })

    mapRef.current = map
    const pointMarkers = pointMarkersRef.current

    return () => {
      document.body.classList.remove('mercator-mode')
      root.style.removeProperty('--globe-rim-center-x')
      root.style.removeProperty('--globe-rim-center-y')
      root.style.removeProperty('--globe-rim-radius')
      root.style.removeProperty('--globe-rim-opacity')
      pointMarkers.forEach(marker => marker.remove())
      pointMarkers.clear()
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [handleSelectNook, isSearchRouteActive, loadNearbyPlaces, loadSearchedPlaces, routeBootCenter, urlSearchLocation])

  useEffect(() => {
    nooksRef.current = mapNooks

    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    pointMarkersRef.current.forEach(marker => marker.remove())
    pointMarkersRef.current.clear()

    ;(map.getSource(SRC) as maplibregl.GeoJSONSource)?.setData(toGeoJSON(mapNooks))
    syncSelectedNookFromUrl(urlSelectedNookSlug)
  }, [mapNooks, syncSelectedNookFromUrl, urlSelectedNookSlug])

  useEffect(() => {
    if (!mapLoadedRef.current) return
    syncSelectedNookFromUrl(urlSelectedNookSlug)
  }, [syncSelectedNookFromUrl, urlSelectedNookSlug])

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

    const currentSelectedSearchLocation = selectedSearchLocationRef.current
    if (!isSearchRouteActive()) {
      const currentNearbyOrigin = nearbyOriginRef.current ?? initialCenterRef.current
      void loadNearbyPlaces(currentNearbyOrigin, filter, { mapTarget: 'nearby', updateMap: true })
    }

    if (currentSelectedSearchLocation) {
      void loadSearchedPlaces(currentSelectedSearchLocation, filter, {
        mapTarget: 'search',
        updateMap: true,
      })
    }
  }, [filter, isSearchRouteActive, loadNearbyPlaces, loadSearchedPlaces])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    const src = map.getSource(RADIUS_CIRCLE_SRC) as maplibregl.GeoJSONSource | undefined
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
      if (!isSearchRouteActive()) {
        const origin = nearbyOriginRef.current ?? initialCenterRef.current
        void loadNearbyPlaces(origin, filter, {
          mapTarget: 'nearby',
          updateMap: mapSyncModeRef.current === 'nearby',
          forceMapUpdate: mapSyncModeRef.current === 'nearby',
        })
      }
      if (selectedSearchLocationRef.current) {
        void loadSearchedPlaces(selectedSearchLocationRef.current, filter, {
          mapTarget: 'search',
          updateMap: mapSyncModeRef.current === 'search',
          forceMapUpdate: mapSyncModeRef.current === 'search',
        })
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [radiusM, isRadiusActive, filter, isSearchRouteActive, loadNearbyPlaces, loadSearchedPlaces])

  const searchBiasLocation = realUserLoc ?? nearbyOrigin
  const leftStackBottomPx = SIDEBAR_BOTTOM_PX + MAP_ATTRIBUTION_SAFE_AREA_PX
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
  const isSearchPeekState = isSearchOpen && !selectedSearchLocation
  const showPeekLift = mobileSheetSnap === 'peek' && (mobileSheetContent !== 'passport' || isSearchPeekState)

  const handleLiftFromPeek = useCallback(() => {
    if (isSearchOpen && !selectedSearchLocation) {
      collapseSearch()
    }
    setMobileSheetSnap('half')
  }, [collapseSearch, isSearchOpen, selectedSearchLocation])

  const handleMobileSnapChange = useCallback((snap: SnapPoint) => {
    // Passport normally stays half/full, but when search is open without a selected
    // location we intentionally allow peek so the panel drops and search can take over.
    const nextSnap = mobileSheetContent === 'passport' && snap === 'peek' && !isSearchPeekState
      ? 'half'
      : snap

    if (isSearchOpen && !selectedSearchLocation && mobileSheetSnap === 'peek' && nextSnap !== 'peek') {
      collapseSearch()
    }

    setMobileSheetSnap(nextSnap)
  }, [collapseSearch, isSearchOpen, isSearchPeekState, mobileSheetContent, mobileSheetSnap, selectedSearchLocation])

  return (
    <div className="nook-map-surface h-dvh w-screen relative overflow-hidden overscroll-none">
      <div className="absolute inset-0">
        <canvas ref={globeCanvasRef} id="nook-map-stars" aria-hidden="true" />
        <div id="nook-globe-rim" aria-hidden="true" />
        <div ref={mapContainerRef} className="nook-map-container relative z-[2] w-full h-full" />
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
                seeding={searchedSeeding}
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
                seeding={nearbySeeding}
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
          <div className="absolute top-4 left-4 z-40">
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
                    {getResultsSummary(nearbyNooks.length, nearbyLoading, nearbySeeding, radiusM, useMiles, isRadiusActive)}
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
                seeding={nearbySeeding}
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
              ) : showSearchResultsPanel && selectedSearchLocation ? (
                <PlacesPanel
                  title={`nooks near ${selectedSearchLocation.name}`}
                  loading={searchedLoading}
                  seeding={searchedSeeding}
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
