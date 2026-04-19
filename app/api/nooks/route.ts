import { NextRequest, NextResponse } from 'next/server'
import {
  buildSuggestionFallback,
  mergeSuggestionResults,
  mergeSuggestions,
  resolvePrimaryThenOptionalFallback,
} from '@/components/map/searchPillQuery'
import {
  toNominatimSearchResult,
  type NominatimApiResult,
  type NominatimSearchResult,
} from '@/components/map/searchTypes'

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'Nook/0.1 (+https://findanook.com)'
const SUGGESTION_LIMIT = 5

function buildViewbox(lat: number, lng: number): string {
  const latDelta = 0.2
  const lonDelta = Math.max(0.2, latDelta / Math.max(Math.cos((lat * Math.PI) / 180), 0.2))

  return [
    (lng - lonDelta).toFixed(6),
    (lat + latDelta).toFixed(6),
    (lng + lonDelta).toFixed(6),
    (lat - latDelta).toFixed(6),
  ].join(',')
}

async function fetchNominatimSuggestions(
  query: string,
  acceptLanguage: string | null,
  proximity: [number, number] | null
): Promise<NominatimSearchResult[]> {
  const requestSuggestions = async (bounded: boolean): Promise<NominatimSearchResult[]> => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      dedupe: '1',
      limit: String(SUGGESTION_LIMIT),
      layer: 'address,poi',
    })

    if (acceptLanguage) {
      params.set('accept-language', acceptLanguage)
    }

    if (proximity) {
      params.set('viewbox', buildViewbox(proximity[1], proximity[0]))
      if (bounded) {
        params.set('bounded', '1')
      }
    }

    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      next: {
        revalidate: 3600,
      },
    })

    if (!response.ok) {
      throw new Error(`Nominatim request failed with status ${response.status}`)
    }

    const results = (await response.json()) as NominatimApiResult[]

    return results
      .map(toNominatimSearchResult)
      .filter(result => Number.isFinite(result.lat) && Number.isFinite(result.lng))
  }

  const boundedSuggestions = await requestSuggestions(true)
  if (boundedSuggestions.length > 0 || !proximity) {
    return boundedSuggestions
  }

  return requestSuggestions(false)
}

// Reserved route on main.
// Venue discovery is sourced from Google Places nearby search rather than user-submitted nooks.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!query) {
    return NextResponse.json({ message: 'Nooks API — not yet implemented' }, { status: 501 })
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] as NominatimSearchResult[] })
  }

  const lat = Number(request.nextUrl.searchParams.get('lat'))
  const lng = Number(request.nextUrl.searchParams.get('lng'))
  const proximity = Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] as [number, number] : null
  const acceptLanguage = request.headers.get('accept-language')
  const fallback = buildSuggestionFallback(query)

  try {
    const [primarySuggestions, fallbackSuggestions] = await resolvePrimaryThenOptionalFallback(
      fetchNominatimSuggestions(query, acceptLanguage, proximity),
      fallback ? fetchNominatimSuggestions(fallback.query, acceptLanguage, proximity) : null,
      () => undefined
    )

    const suggestions = fallback && fallbackSuggestions
      ? mergeSuggestionResults(primarySuggestions, fallbackSuggestions, fallback, SUGGESTION_LIMIT)
      : mergeSuggestions(primarySuggestions, fallbackSuggestions ?? [], SUGGESTION_LIMIT)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch search suggestions' }, { status: 502 })
  }
}

export async function POST() {
  return NextResponse.json({ message: 'Nooks API — not yet implemented' }, { status: 501 })
}
