'use client'

import maplibregl from 'maplibre-gl'
import { buildStampMapStyle } from './stamp-map-style'

const SNAPSHOT_SIZE = 384
const SNAPSHOT_ZOOM = 14
const CACHE_PREFIX = 'nook:stamp-map:v1:'
const CACHE_VERSION_KEY = 'nook:stamp-map:version'
const CURRENT_VERSION = '2'

interface QueueItem {
  nookId: string
  lat: number
  lng: number
  resolve: (dataUrl: string) => void
  reject: (err: Error) => void
}

let mapInstance: maplibregl.Map | null = null
let mapContainer: HTMLDivElement | null = null
let mapReady: Promise<void> | null = null
const queue: QueueItem[] = []
const inFlight = new Map<string, Promise<string>>()
let isProcessing = false

function ensureCacheVersion() {
  if (typeof window === 'undefined') return
  try {
    const stored = window.localStorage.getItem(CACHE_VERSION_KEY)
    if (stored !== CURRENT_VERSION) {
      // Wipe stale snapshots when the style changes.
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key)
      }
      window.localStorage.setItem(CACHE_VERSION_KEY, CURRENT_VERSION)
    }
  } catch {
    // localStorage may be disabled (private browsing); silently no-op.
  }
}

function readCache(nookId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CACHE_PREFIX + nookId)
  } catch {
    return null
  }
}

function writeCache(nookId: string, dataUrl: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_PREFIX + nookId, dataUrl)
  } catch {
    // Quota exceeded — silently drop. The next view will re-snapshot.
  }
}

function ensureMap(): Promise<void> {
  if (mapReady) return mapReady

  ensureCacheVersion()

  // Wrap the MapLibre container in a defensive cage so it can never appear
  // even if MapLibre or some other code resets the inner element's inline styles.
  const cage = document.createElement('div')
  cage.setAttribute('aria-hidden', 'true')
  cage.style.position = 'fixed'
  cage.style.left = '0'
  cage.style.top = '0'
  cage.style.width = '0'
  cage.style.height = '0'
  cage.style.overflow = 'hidden'
  cage.style.visibility = 'hidden'
  cage.style.pointerEvents = 'none'
  cage.style.zIndex = '-1'
  cage.style.opacity = '0'

  mapContainer = document.createElement('div')
  mapContainer.style.position = 'absolute'
  mapContainer.style.width = `${SNAPSHOT_SIZE}px`
  mapContainer.style.height = `${SNAPSHOT_SIZE}px`
  mapContainer.style.left = '0'
  mapContainer.style.top = '0'
  mapContainer.style.pointerEvents = 'none'

  cage.appendChild(mapContainer)
  document.body.appendChild(cage)

  mapInstance = new maplibregl.Map({
    container: mapContainer,
    style: buildStampMapStyle(),
    center: [0, 0],
    zoom: SNAPSHOT_ZOOM,
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    fadeDuration: 0,
    refreshExpiredTiles: false,
  })

  mapReady = new Promise<void>((resolve, reject) => {
    if (!mapInstance) return reject(new Error('Map not initialised'))
    const onLoad = () => resolve()
    const onError = (e: { error?: Error }) => {
      if (e.error) reject(e.error)
    }
    mapInstance.once('load', onLoad)
    mapInstance.on('error', onError)
  })

  return mapReady
}

async function captureCurrentFrame(): Promise<string> {
  if (!mapInstance) throw new Error('Map not initialised')
  // One redraw to ensure the canvas has the latest paint.
  mapInstance.triggerRepaint()
  await new Promise<void>((resolve) =>
    mapInstance!.once('idle', () => resolve())
  )
  const canvas = mapInstance.getCanvas()
  return canvas.toDataURL('image/png')
}

async function processNext() {
  if (isProcessing) return
  const item = queue.shift()
  if (!item) return
  isProcessing = true

  try {
    await ensureMap()
    if (!mapInstance) throw new Error('Map not initialised')

    mapInstance.jumpTo({ center: [item.lng, item.lat], zoom: SNAPSHOT_ZOOM })
    await new Promise<void>((resolve) =>
      mapInstance!.once('idle', () => resolve())
    )

    const dataUrl = await captureCurrentFrame()
    writeCache(item.nookId, dataUrl)
    item.resolve(dataUrl)
  } catch (err) {
    item.reject(err instanceof Error ? err : new Error(String(err)))
  } finally {
    isProcessing = false
    if (queue.length) void processNext()
  }
}

/**
 * Returns a data URL of the engraved-style map for the given nook.
 * Reads from localStorage cache first; otherwise queues a snapshot on the
 * shared off-screen MapLibre instance and resolves when ready.
 */
export function getStampMapImage(
  nookId: string,
  lat: number,
  lng: number,
): Promise<string> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('getStampMapImage is browser-only'))
  }

  const cached = readCache(nookId)
  if (cached) return Promise.resolve(cached)

  const existing = inFlight.get(nookId)
  if (existing) return existing

  const promise = new Promise<string>((resolve, reject) => {
    queue.push({ nookId, lat, lng, resolve, reject })
    void processNext()
  }).finally(() => {
    inFlight.delete(nookId)
  })

  inFlight.set(nookId, promise)
  return promise
}
