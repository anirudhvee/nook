'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import { ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthControls } from '@/components/auth/AuthControls'
import type { NookPlace, NookType, FilterType } from '@/types/nook'
import { NookDetailPanel } from '@/components/nook/NookDetailPanel'
import { SearchPill } from '@/components/map/SearchPill'

const SF_CENTER: [number, number] = [-122.4194, 37.7749]
const GEO_TIMEOUT_MS = 8000

const SRC = 'nooks'
const L_CLUSTERS = 'clusters'
const L_CLUSTER_COUNT = 'cluster-count'

const COLOR_NORMAL = 'oklch(0.42 0.09 145)'
const COLOR_SELECTED = '#c4623a'

const SIDEBAR_BOTTOM_PX = 16
const MAPBOX_LOGO_SAFE_AREA_PX = 28
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
  onToggleUnit: () => void
  onSelectNook: (nook: NookPlace) => void
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
  onToggleUnit,
  onSelectNook,
}: PlacesPanelProps) {
  const placesWithDist = places.map(nook => ({
    ...nook,
    dist: distanceOrigin ? distanceM([distanceOrigin[1], distanceOrigin[0]], [nook.lat, nook.lng]) : undefined,
  }))

  return (
    <>
      <div className="px-4 pt-4 pb-3 shrink-0 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-base truncate">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading
              ? 'finding spots…'
              : `${places.length} spot${places.length !== 1 ? 's' : ''} within 1.5km`}
          </p>
        </div>
        <button
          onClick={onToggleUnit}
          className="shrink-0 mt-0.5 text-xs font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5 hover:bg-muted transition-colors"
        >
          {useMiles ? 'mi' : 'km'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {placesWithDist.map(nook => {
          const isSelected = nook.id === selectedId
          return (
            <button
              key={nook.id}
              onClick={() => onSelectNook(nook)}
              className={cn(
                'w-full text-left p-3 rounded-xl border transition-colors',
                isSelected
                  ? 'bg-primary/10 border-primary/25'
                  : 'bg-card border-border hover:bg-muted/60'
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
                  {nook.workSignals.map(signal => (
                    <span
                      key={signal}
                      className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              )}
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

export function DiscoveryMap() {
  const searchParams = useSearchParams()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
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

  const fetchPlaces = useCallback(async (lat: number, lng: number, type: FilterType) => {
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), type })
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

  const restoreNearbyView = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'nearby'
    setIsSearchOpen(false)

    const target = realUserLocRef.current ?? nearbyOriginRef.current ?? SF_CENTER
    mapRef.current?.flyTo({ center: target, zoom: 14, duration: 1000 })
    void loadNearbyPlaces(target, filter, {
      forceMapUpdate: true,
      mapTarget: 'nearby',
      updateMap: true,
    })
  }, [clearSelectedNook, filter, loadNearbyPlaces])

  const beginEditingSelectedLocation = useCallback(() => {
    clearSelectedNook()
    mapSyncModeRef.current = 'frozen'
    setSelectedSearchLocation(null)
    invalidateSearchedResults()
  }, [clearSelectedNook, invalidateSearchedResults])

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

    mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 })
    void loadSearchedPlaces(location, filter, { mapTarget: 'search', updateMap: true })
  }, [clearSelectedNook, filter, loadSearchedPlaces])

  const fetchAndOpenNook = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/places/${encodeURIComponent(id)}`)
      if (!res.ok) return
      const raw = await res.json() as {
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
      }

      handleSelectNook(nook)
    } catch {
      // network error
    }
  }, [handleSelectNook])

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

      const coords: [number, number] = [e.coords.longitude, e.coords.latitude]
      realUserLocRef.current = coords
      nearbyOriginRef.current = coords
      setRealUserLoc(coords)
      setNearbyOrigin(coords)
      void loadNearbyPlaces(coords, 'all', { mapTarget: 'nearby', updateMap: true })
    })

    geolocate.on('error', () => {
      if (geoResolved) return
      geoResolved = true
      clearTimeout(fallbackTimer)
      nearbyOriginRef.current = SF_CENTER
      setNearbyOrigin(SF_CENTER)
      void loadNearbyPlaces(SF_CENTER, 'all', { mapTarget: 'nearby', updateMap: true })
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

      geolocate.trigger()
      fallbackTimer = setTimeout(() => {
        if (geoResolved) return
        geoResolved = true
        nearbyOriginRef.current = SF_CENTER
        setNearbyOrigin(SF_CENTER)
        void loadNearbyPlaces(SF_CENTER, 'all', { mapTarget: 'nearby', updateMap: true })
      }, GEO_TIMEOUT_MS)
    })

    mapRef.current = map
    const pointMarkers = pointMarkersRef.current

    return () => {
      clearTimeout(fallbackTimer)
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

    const currentNearbyOrigin = nearbyOriginRef.current ?? SF_CENTER
    const currentSelectedSearchLocation = selectedSearchLocationRef.current

    void loadNearbyPlaces(currentNearbyOrigin, filter, { mapTarget: 'nearby', updateMap: true })

    if (currentSelectedSearchLocation) {
      void loadSearchedPlaces(currentSelectedSearchLocation, filter, {
        mapTarget: 'search',
        updateMap: true,
      })
    }
  }, [filter, loadNearbyPlaces, loadSearchedPlaces])

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
                {nearbyLoading
                  ? 'finding spots…'
                  : `${nearbyNooks.length} spot${nearbyNooks.length !== 1 ? 's' : ''} within 1.5km`}
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
            onToggleUnit={() => setUseMiles(value => !value)}
            onSelectNook={handleSelectNook}
          />
        )}
      </div>

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
              onToggleUnit={() => setUseMiles(value => !value)}
              onSelectNook={handleSelectNook}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
