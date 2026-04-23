import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { FilterType, NookPlace, NookType } from '@/types/nook'

const DEFAULT_LAT = 37.7749
const DEFAULT_LNG = -122.4194
const DEFAULT_RADIUS_METERS = 1500
const MAX_RADIUS_METERS = 50000
const METERS_PER_DEGREE_LAT = 111000
const SEED_TRIGGER_TIMEOUT_MS = 10_000

const FILTERS = new Set<FilterType>(['all', 'cafe', 'library', 'coworking', 'other'])
const NOOK_TYPES = new Set<NookType>(['cafe', 'library', 'coworking', 'other'])

interface NearbyNookRow {
  id: string
  slug: string
  overture_id: string
  name: string
  lat: number
  lng: number
  address: string | null
  type: string
  city: string | null
  region: string | null
  country: string | null
  website: string | null
  phone: string | null
  operating_status: string
  seed_run_id: string | null
}

interface SeedTriggerPayload {
  status?: string
}

function parseNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseCoordinate(value: string | null): number | null {
  if (value === null) return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRadius(value: string | null): number {
  const parsed = Math.trunc(parseNumber(value, DEFAULT_RADIUS_METERS))
  return Math.min(Math.max(parsed, 1), MAX_RADIUS_METERS)
}

function parseFilter(value: string | null): FilterType {
  return FILTERS.has(value as FilterType) ? value as FilterType : 'all'
}

function normalizeNookType(value: string): NookType {
  return NOOK_TYPES.has(value as NookType) ? value as NookType : 'other'
}

function toNookPlace(row: NearbyNookRow): NookPlace {
  return {
    id: row.id,
    slug: row.slug,
    overture_id: row.overture_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    type: normalizeNookType(row.type),
    city: row.city,
    region: row.region,
    country: row.country,
    website: row.website,
    phone: row.phone,
    operating_status: row.operating_status,
    seed_run_id: row.seed_run_id,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatCoord(value: number): string {
  return value.toFixed(5)
}

function bboxForRadius(lat: number, lng: number, radiusMeters: number): string {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 0.01))

  return [
    formatCoord(clamp(lng - lngDelta, -180, 180)),
    formatCoord(clamp(lat - latDelta, -90, 90)),
    formatCoord(clamp(lng + lngDelta, -180, 180)),
    formatCoord(clamp(lat + latDelta, -90, 90)),
  ].join(',')
}

async function triggerSeed(request: NextRequest, bbox: string): Promise<Response> {
  const seedSecret = process.env.SEED_TRIGGER_SECRET
  if (!seedSecret) {
    throw new Error('Seed trigger secret is not configured.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEED_TRIGGER_TIMEOUT_MS)

  try {
    return await fetch(new URL('/api/seed/trigger', request.nextUrl.origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-seed-trigger-secret': seedSecret,
      },
      body: JSON.stringify({ bbox }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function canTriggerSeedForRequest(): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return !error && Boolean(user)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  const parsedLat = parseCoordinate(latParam)
  const parsedLng = parseCoordinate(lngParam)
  const lat = latParam === null ? DEFAULT_LAT : parsedLat
  const lng = lngParam === null ? DEFAULT_LNG : parsedLng
  const radius = parseRadius(searchParams.get('radius'))
  const filter = parseFilter(searchParams.get('type'))

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: 'lat and lng must be valid coordinates.' },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('search_nooks_nearby', {
    p_lat: lat,
    p_lng: lng,
    p_radius_meters: radius,
    p_type: filter === 'all' ? null : filter,
    p_limit: 100,
  })

  if (error) {
    console.error('Nearby nook search failed', { error: error.message })
    return NextResponse.json({ error: 'Unable to search nearby nooks.' }, { status: 500 })
  }

  const places = ((data ?? []) as NearbyNookRow[]).map(toNookPlace)

  if (places.length > 0) {
    return NextResponse.json({ places })
  }

  if (!(await canTriggerSeedForRequest())) {
    return NextResponse.json({ places: [] })
  }

  const bbox = bboxForRadius(lat, lng, radius)
  let seedResponse: Response
  try {
    seedResponse = await triggerSeed(request, bbox)
  } catch (error) {
    console.warn('Skipping seed trigger for empty places search', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ places: [] })
  }

  if (!seedResponse.ok) {
    const text = await seedResponse.text()
    console.warn('Seed trigger failed for empty places search', {
      status: seedResponse.status,
      body: text || null,
    })
    return NextResponse.json({ places: [], seeding: false })
  }

  let seedPayload: SeedTriggerPayload | null = null
  try {
    seedPayload = await seedResponse.json() as SeedTriggerPayload
  } catch {
    seedPayload = null
  }

  return NextResponse.json({
    places: [],
    seeding: seedPayload?.status === 'pending' || seedPayload?.status === 'seeding',
  })
}
