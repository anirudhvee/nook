import { NextResponse } from 'next/server'
import { pickPrimaryPhoto } from '@/lib/place-photo'
import type { NookPhoto } from '@/types/nook'

const PLACES_DETAIL_URL = 'https://places.googleapis.com/v1/places'

interface PlacePhotoApiResponse {
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

interface PlacePhotoResponse {
  photo?: NookPhoto
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  const res = await fetch(`${PLACES_DETAIL_URL}/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'photos',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = (await res.json()) as PlacePhotoApiResponse
  const response: PlacePhotoResponse = {
    photo: pickPrimaryPhoto(data.photos),
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
