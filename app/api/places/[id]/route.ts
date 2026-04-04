import { NextRequest, NextResponse } from 'next/server'

const PLACES_DETAIL_URL = 'https://places.googleapis.com/v1/places'

interface PlaceDetailApiResponse {
  displayName?: { text: string; languageCode: string }
  formattedAddress?: string
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>
  rating?: number
  types?: string[]
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

export async function GET(
  _req: NextRequest,
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
        'displayName,formattedAddress,addressComponents,rating,types,regularOpeningHours',
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
