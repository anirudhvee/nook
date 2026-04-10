import { NextRequest, NextResponse } from 'next/server'

const PLACES_DETAIL_URL = 'https://places.googleapis.com/v1/places'

interface PlaceDetailApiResponse {
  displayName?: { text: string; languageCode: string }
  location?: { latitude: number; longitude: number }
  formattedAddress?: string
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>
  rating?: number
  types?: string[]
  reviewSummary?: {
    text?: { text?: string; languageCode?: string }
    disclosureText?: { text?: string; languageCode?: string }
    flagContentUri?: string
    reviewsUri?: string
  }
  generativeSummary?: {
    overview?: { text?: string; languageCode?: string }
    description?: { text?: string; languageCode?: string }
    references?: {
      reviews?: Array<{
        review?: string
        flagContentUri?: string
      }>
    }
    disclaimerText?: { text?: string; languageCode?: string }
  }
  reviews?: Array<{
    name?: string
    relativePublishTimeDescription?: string
    rating?: number
    text?: { text?: string; languageCode?: string }
    originalText?: { text?: string; languageCode?: string }
    authorAttribution?: {
      displayName?: string
      uri?: string
      photoUri?: string
    }
    publishTime?: string
  }>
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  const res = await fetch(`${PLACES_DETAIL_URL}/${encodeURIComponent(id)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        [
          'displayName',
          'formattedAddress',
          'addressComponents',
          'location',
          'rating',
          'types',
          'regularOpeningHours',
          'reviewSummary',
          'generativeSummary',
          'reviews',
        ].join(','),
    },
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = (await res.json()) as PlaceDetailApiResponse
  return NextResponse.json(data)
}
