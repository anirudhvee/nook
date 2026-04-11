import { pickPrimaryPhoto } from '@/lib/place-photo'
import type { NookPhoto, NookType } from '@/types/nook'

const PLACES_DETAIL_URL = 'https://places.googleapis.com/v1/places'

export interface GooglePlacesAddressComponent {
  longText: string
  shortText: string
  types?: string[]
}

interface GooglePlacePreviewResponse {
  displayName?: { text?: string; languageCode?: string }
  formattedAddress?: string
  addressComponents?: GooglePlacesAddressComponent[]
  location?: { latitude?: number; longitude?: number }
  types?: string[]
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

export interface PassportPlacePreview {
  id: string
  name: string
  address: string
  neighborhood?: string
  city?: string
  region?: string
  locationLine: string
  type: NookType
  photo?: NookPhoto
  lat?: number
  lng?: number
}

export function inferNookType(types: string[]): NookType {
  if (types.some(type => ['cafe', 'coffee_shop'].includes(type))) return 'cafe'
  if (types.includes('library')) return 'library'
  if (types.includes('coworking_space')) return 'coworking'
  return 'other'
}

export function extractNeighborhood(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  const match =
    components.find(component => component.types?.includes('neighborhood')) ??
    components.find(component => component.types?.includes('sublocality_level_1')) ??
    components.find(component => component.types?.includes('sublocality'))

  return match?.longText
}

export function extractCity(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  const match =
    components.find(component => component.types?.includes('locality')) ??
    components.find(component => component.types?.includes('postal_town'))

  return match?.longText
}

export function extractRegion(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  return components.find(component =>
    component.types?.includes('administrative_area_level_1')
  )?.shortText
}

export function buildPassportLocationLine({
  neighborhood,
  city,
  region,
}: {
  neighborhood?: string
  city?: string
  region?: string
}): string {
  if (neighborhood && city) return `${neighborhood}, ${city}`
  if (city && region) return `${city}, ${region}`
  if (city) return city
  if (neighborhood) return neighborhood
  if (region) return region
  return 'Location unavailable'
}

export async function fetchGooglePlacePreview(
  placeId: string,
): Promise<PassportPlacePreview | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(`${PLACES_DETAIL_URL}/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'displayName',
          'formattedAddress',
          'addressComponents',
          'location',
          'types',
          'photos',
        ].join(','),
      },
      next: { revalidate: 3600 },
    })

    if (!response.ok) return null

    const data = (await response.json()) as GooglePlacePreviewResponse
    const addressComponents = data.addressComponents ?? []
    const neighborhood = extractNeighborhood(addressComponents)
    const city = extractCity(addressComponents)
    const region = extractRegion(addressComponents)

    return {
      id: placeId,
      name: data.displayName?.text?.trim() || 'Unknown nook',
      address: data.formattedAddress?.trim() || '',
      neighborhood,
      city,
      region,
      locationLine: buildPassportLocationLine({ neighborhood, city, region }),
      type: inferNookType(data.types ?? []),
      photo: pickPrimaryPhoto(data.photos),
      lat: data.location?.latitude,
      lng: data.location?.longitude,
    }
  } catch {
    return null
  }
}
