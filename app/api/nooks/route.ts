import { NextRequest, NextResponse } from 'next/server'
import {
  buildSuggestionFallback,
  mergeSuggestionResults,
  mergeSuggestions,
  resolvePrimaryThenOptionalFallback,
} from '@/components/map/searchPillQuery'
import {
  toSearchSuggestion,
  type GeoapifyAutocompleteResponse,
  type SearchSuggestion,
} from '@/components/map/searchTypes'

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'
const AUTOCOMPLETE_REVALIDATE_SECONDS = 600
const SUGGESTION_LIMIT = 5

type SuggestionFetchResult = {
  suggestions: SearchSuggestion[]
  unavailable: boolean
}

function getPreferredLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null

  const preferredLanguage = acceptLanguage
    .split(',')
    .map(part => part.split(';')[0]?.trim())
    .find(Boolean) ?? null

  if (!preferredLanguage) return null

  return preferredLanguage.split('-')[0]?.toLowerCase() ?? null
}

async function fetchGeoapifySuggestions(
  query: string,
  acceptLanguage: string | null,
  proximity: [number, number] | null
): Promise<SuggestionFetchResult> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
  if (!apiKey) {
    return {
      suggestions: [],
      unavailable: true,
    }
  }

  const params = new URLSearchParams({
    text: query,
    format: 'json',
    limit: String(SUGGESTION_LIMIT),
    apiKey,
  })

  const preferredLanguage = getPreferredLanguage(acceptLanguage)
  if (preferredLanguage) {
    params.set('lang', preferredLanguage)
  }

  if (proximity) {
    params.set('bias', `proximity:${proximity[0]},${proximity[1]}`)
  }

  const response = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
    next: {
      revalidate: AUTOCOMPLETE_REVALIDATE_SECONDS,
    },
  })

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return {
      suggestions: [],
      unavailable: true,
    }
  }

  if (!response.ok) {
    throw new Error(`Geoapify request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as GeoapifyAutocompleteResponse

  return {
    suggestions: (payload.results ?? [])
      .map(toSearchSuggestion)
      .filter(result => Number.isFinite(result.lat) && Number.isFinite(result.lng)),
    unavailable: false,
  }
}

// Reserved route on main.
// Venue discovery is sourced from Google Places nearby search rather than user-submitted nooks.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!query) {
    return NextResponse.json({ message: 'Nooks API — not yet implemented' }, { status: 501 })
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] as SearchSuggestion[], unavailable: false })
  }

  const latParam = request.nextUrl.searchParams.get('lat')
  const lngParam = request.nextUrl.searchParams.get('lng')
  const lat = latParam === null ? Number.NaN : Number(latParam)
  const lng = lngParam === null ? Number.NaN : Number(lngParam)
  const proximity = Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] as [number, number] : null
  const acceptLanguage = request.headers.get('accept-language')
  const fallback = buildSuggestionFallback(query)

  try {
    const [primaryResult, fallbackResult] = await resolvePrimaryThenOptionalFallback(
      fetchGeoapifySuggestions(query, acceptLanguage, proximity),
      fallback ? fetchGeoapifySuggestions(fallback.query, acceptLanguage, proximity) : null,
      () => undefined
    )

    if (primaryResult.unavailable) {
      return NextResponse.json({ suggestions: [] as SearchSuggestion[], unavailable: true })
    }

    const fallbackSuggestions = fallbackResult?.unavailable ? null : fallbackResult?.suggestions ?? null
    const suggestions = fallback && fallbackSuggestions
      ? mergeSuggestionResults(primaryResult.suggestions, fallbackSuggestions, fallback, SUGGESTION_LIMIT)
      : mergeSuggestions(primaryResult.suggestions, fallbackSuggestions ?? [], SUGGESTION_LIMIT)

    return NextResponse.json({ suggestions, unavailable: false })
  } catch {
    return NextResponse.json(
      { suggestions: [] as SearchSuggestion[], unavailable: true },
      { status: 502 }
    )
  }
}

export async function POST() {
  return NextResponse.json({ message: 'Nooks API — not yet implemented' }, { status: 501 })
}
