import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const APIFY_API_URL =
  'https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper/run-sync-get-dataset-items'
const REVIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface ReviewRow {
  id: string
  nook_id: string
  source: string
  review_text: string | null
  rating: number | null
  reviewed_at: string | null
  fetched_at: string
}

interface ApifyReviewItem {
  text?: string | null
  reviewText?: string | null
  reviewTextTranslated?: string | null
  stars?: number | string | null
  rating?: number | string | null
  publishedAtDate?: string | null
  publishedAt?: string | null
  publishedDate?: string | null
  date?: string | null
}

function normalizeText(item: ApifyReviewItem): string | null {
  const text = item.text ?? item.reviewText ?? item.reviewTextTranslated ?? null
  if (!text) return null

  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeRating(item: ApifyReviewItem): number | null {
  const raw = item.rating ?? item.stars ?? null
  if (typeof raw === 'number' && raw >= 1 && raw <= 5) return raw

  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) return parsed
  }

  return null
}

function normalizeReviewedAt(item: ApifyReviewItem): string | null {
  const raw = item.publishedAtDate ?? item.publishedAt ?? item.publishedDate ?? item.date ?? null
  if (!raw) return null

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function getLatestBatch(rows: ReviewRow[]): ReviewRow[] {
  const latestFetchedAt = rows[0]?.fetched_at
  return latestFetchedAt ? rows.filter(row => row.fetched_at === latestFetchedAt) : []
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: placeId } = await params

  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 })
  }

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json({ error: 'Apify API token not configured' }, { status: 500 })
  }

  const supabase = await createServiceClient()
  const { data: existingRows, error: existingError } = await supabase
    .from('reviews')
    .select('id, nook_id, source, review_text, rating, reviewed_at, fetched_at')
    .eq('nook_id', placeId)
    .order('fetched_at', { ascending: false })
    .order('reviewed_at', { ascending: false, nullsFirst: false })

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const latestCachedBatch = getLatestBatch((existingRows ?? []) as ReviewRow[])
  const latestFetchedAt = latestCachedBatch[0]?.fetched_at
  if (latestFetchedAt) {
    const ageMs = Date.now() - new Date(latestFetchedAt).getTime()
    if (ageMs <= REVIEWS_TTL_MS) {
      return NextResponse.json({ reviews: latestCachedBatch, cached: true })
    }
  }

  const apifyResponse = await fetch(`${APIFY_API_URL}?token=${encodeURIComponent(apifyToken)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      placeIds: [placeId],
      reviewsOrigin: 'google',
      personalData: false,
      language: 'en',
    }),
  })

  if (!apifyResponse.ok) {
    const text = await apifyResponse.text()
    return NextResponse.json({ error: text }, { status: apifyResponse.status })
  }

  const rawApifyItems = (await apifyResponse.json()) as unknown
  if (!Array.isArray(rawApifyItems)) {
    return NextResponse.json({ error: 'Apify returned an unexpected payload' }, { status: 502 })
  }

  const apifyItems = rawApifyItems as ApifyReviewItem[]
  const fetchedAt = new Date().toISOString()
  const reviewsToInsert = apifyItems
    .map(item => ({
      nook_id: placeId,
      source: 'google',
      review_text: normalizeText(item),
      rating: normalizeRating(item),
      reviewed_at: normalizeReviewedAt(item),
      fetched_at: fetchedAt,
    }))
    .filter(review => review.review_text !== null || review.rating !== null)

  const { error: deleteReviewsError } = await supabase.from('reviews').delete().eq('nook_id', placeId)
  if (deleteReviewsError) {
    return NextResponse.json({ error: deleteReviewsError.message }, { status: 500 })
  }

  if (reviewsToInsert.length === 0) {
    const { error: deleteSignalsError } = await supabase
      .from('work_signals')
      .delete()
      .eq('nook_id', placeId)

    if (deleteSignalsError) {
      return NextResponse.json({ error: deleteSignalsError.message }, { status: 500 })
    }

    return NextResponse.json({ reviews: [], cached: false })
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('reviews')
    .insert(reviewsToInsert)
    .select('id, nook_id, source, review_text, rating, reviewed_at, fetched_at')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ reviews: insertedRows ?? [], cached: false })
}
