import { NextRequest, NextResponse } from 'next/server'
import type { NookPlace, NookType, FilterType } from '@/types/nook'
import { pickPrimaryPhoto } from '@/lib/place-photo'

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchNearby'

const EXCLUDED_TYPES = new Set([
  'convenience_store',
  'gas_station',
  'fast_food_restaurant',
])

const INCLUDED_TYPES: Record<FilterType, string[]> = {
  all: ['cafe', 'library', 'coworking_space'],
  cafe: ['cafe', 'coffee_shop'],
  library: ['library'],
  coworking: ['coworking_space'],
  other: ['lodging'],
}

interface AddressComponent {
  longText: string
  shortText: string
  types: string[]
}

interface PlacesApiPlace {
  id: string
  displayName: { text: string; languageCode: string }
  formattedAddress: string
  addressComponents?: AddressComponent[]
  location: { latitude: number; longitude: number }
  rating?: number
  types?: string[]
  businessStatus?: string
  photos?: Array<{
    name: string
    widthPx: number
    heightPx: number
    authorAttributions?: Array<{
      displayName?: string
      uri?: string
      photoUri?: string
    }>
  }>
}

interface PlacesApiResponse {
  places?: PlacesApiPlace[]
}

function inferNookType(types: string[]): NookType {
  if (types.some(t => ['cafe', 'coffee_shop'].includes(t))) return 'cafe'
  if (types.includes('library')) return 'library'
  if (types.includes('coworking_space')) return 'coworking'
  return 'other'
}

function extractNeighborhood(components: AddressComponent[]): string | undefined {
  const match =
    components.find(c => c.types?.includes('neighborhood')) ??
    components.find(c => c.types?.includes('sublocality_level_1')) ??
    components.find(c => c.types?.includes('sublocality'))
  return match?.longText
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '37.7749')
  const lng = parseFloat(searchParams.get('lng') ?? '-122.4194')
  const radius = Math.min(parseInt(searchParams.get('radius') ?? '1500', 10), 50000)
  const filter = (searchParams.get('type') ?? 'all') as FilterType

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    },
    includedTypes: INCLUDED_TYPES[filter] ?? INCLUDED_TYPES.all,
    maxResultCount: 20,
  }

  const res = await fetch(PLACES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.rating,places.types,places.businessStatus,places.photos',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = (await res.json()) as PlacesApiResponse

  const places: NookPlace[] = (data.places ?? [])
    .filter(p => p.businessStatus !== 'CLOSED_TEMPORARILY')
    .filter(p => !(p.types ?? []).some(t => EXCLUDED_TYPES.has(t)))
    .map(p => ({
      id: p.id,
      name: p.displayName.text,
      lat: p.location.latitude,
      lng: p.location.longitude,
      address: p.formattedAddress,
      neighborhood: p.addressComponents
        ? extractNeighborhood(p.addressComponents)
        : undefined,
      type: inferNookType(p.types ?? []),
      rating: p.rating,
      workSignals: [],
      photo: pickPrimaryPhoto(p.photos),
    }))

  return NextResponse.json({ places })
}
