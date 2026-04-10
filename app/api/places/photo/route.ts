import { NextRequest, NextResponse } from 'next/server'
import {
  isValidPlacePhotoRef,
  parsePlacePhotoMaxWidth,
} from '@/lib/place-photo'

const MEDIA_BASE = 'https://places.googleapis.com/v1'
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref')

  if (!ref || !isValidPlacePhotoRef(ref)) {
    return NextResponse.json({ error: 'Invalid photo reference' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const maxWidth = parsePlacePhotoMaxWidth(request.nextUrl.searchParams.get('maxWidth'))

  try {
    const upstreamUrl = new URL(`${MEDIA_BASE}/${ref}/media`)
    upstreamUrl.searchParams.set('maxWidthPx', String(maxWidth))
    upstreamUrl.searchParams.set('maxHeightPx', String(maxWidth))
    upstreamUrl.searchParams.set('skipHttpRedirect', 'true')
    upstreamUrl.searchParams.set('key', apiKey)

    const res = await fetch(upstreamUrl, {
      cache: 'no-store',
    })

    if (!res.ok) {
      return new NextResponse(null, {
        status: res.status,
        headers: NO_STORE_HEADERS,
      })
    }

    const data = (await res.json()) as { photoUri?: string }

    if (!data.photoUri) {
      return new NextResponse(null, {
        status: 502,
        headers: NO_STORE_HEADERS,
      })
    }

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: data.photoUri,
        ...NO_STORE_HEADERS,
      },
    })
  } catch {
    return new NextResponse(null, {
      status: 500,
      headers: NO_STORE_HEADERS,
    })
  }
}
