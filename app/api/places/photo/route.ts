import { NextRequest, NextResponse } from 'next/server'

const MEDIA_BASE = 'https://places.googleapis.com/v1'

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref')

  if (!ref || !ref.startsWith('places/') || !ref.includes('/photos/')) {
    return NextResponse.json({ error: 'Invalid photo reference' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const maxWidth = request.nextUrl.searchParams.get('maxWidth') ?? '400'

  try {
    const res = await fetch(
      `${MEDIA_BASE}/${ref}/media?maxWidthPx=${maxWidth}&maxHeightPx=${maxWidth}&skipHttpRedirect=true&key=${apiKey}`,
    )

    if (!res.ok) {
      return new NextResponse(null, { status: 404 })
    }

    const data = (await res.json()) as { photoUri?: string }

    if (!data.photoUri) {
      return new NextResponse(null, { status: 404 })
    }

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: data.photoUri,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
