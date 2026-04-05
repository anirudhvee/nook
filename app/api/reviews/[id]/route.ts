import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const APIFY_RUN_API_URL = 'https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper/runs'
const APIFY_RUN_STATUS_API_URL = 'https://api.apify.com/v2/actor-runs'
const APIFY_DATASET_API_URL = 'https://api.apify.com/v2/datasets'
const APIFY_FILTER_QUERY =
  'wifi OR laptop OR work OR outlet OR plug OR quiet OR noise OR seating OR crowded'
const APIFY_MAX_REVIEWS = 50
const APIFY_TIMEOUT_MS = 60_000
const APIFY_POLL_INTERVAL_MS = 2_000
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

interface ApifyRun {
  id: string
  status: string
  defaultDatasetId?: string | null
}

interface ApifyRunResponse {
  data?: ApifyRun
  error?: {
    message?: string
  }
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

async function pollApifyRun(runId: string, apifyToken: string): Promise<ApifyRun> {
  const deadline = Date.now() + APIFY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await fetch(
      `${APIFY_RUN_STATUS_API_URL}/${encodeURIComponent(runId)}?waitForFinish=${APIFY_POLL_INTERVAL_MS / 1000}`,
      {
        headers: {
          Authorization: `Bearer ${apifyToken}`,
        },
      }
    )

    const payload = (await response.json()) as ApifyRunResponse
    if (!response.ok) {
      return Promise.reject(new Error(payload.error?.message ?? 'Failed to poll Apify run'))
    }

    const run = payload.data
    if (!run) {
      return Promise.reject(new Error('Apify returned an empty run status payload'))
    }

    if (run.status === 'SUCCEEDED') {
      return run
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      return Promise.reject(new Error(`Apify run finished with status ${run.status}`))
    }
  }

  return Promise.reject(new Error('Apify run timed out after 60 seconds'))
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

  const apifyRunResponse = await fetch(`${APIFY_RUN_API_URL}?timeout=60`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apifyToken}`,
    },
    body: JSON.stringify({
      placeIds: [placeId],
      reviewsFilterString: APIFY_FILTER_QUERY,
      maxReviews: APIFY_MAX_REVIEWS,
      reviewsOrigin: 'google',
      personalData: false,
      language: 'en',
    }),
  })

  const apifyRunPayload = (await apifyRunResponse.json()) as ApifyRunResponse
  if (!apifyRunResponse.ok) {
    return NextResponse.json(
      { error: apifyRunPayload.error?.message ?? 'Failed to start Apify run' },
      { status: apifyRunResponse.status }
    )
  }

  const startedRun = apifyRunPayload.data
  if (!startedRun?.id) {
    return NextResponse.json({ error: 'Apify did not return a run ID' }, { status: 502 })
  }

  let completedRun: ApifyRun
  try {
    completedRun = await pollApifyRun(startedRun.id, apifyToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apify polling failed'
    return NextResponse.json({ error: message }, { status: 504 })
  }

  const datasetId = completedRun.defaultDatasetId
  if (!datasetId) {
    return NextResponse.json({ error: 'Apify run did not produce a dataset' }, { status: 502 })
  }

  const apifyItemsResponse = await fetch(
    `${APIFY_DATASET_API_URL}/${encodeURIComponent(datasetId)}/items?format=json&clean=true`,
    {
      headers: {
        Authorization: `Bearer ${apifyToken}`,
      },
    }
  )

  if (!apifyItemsResponse.ok) {
    const text = await apifyItemsResponse.text()
    return NextResponse.json({ error: text }, { status: apifyItemsResponse.status })
  }

  const rawApifyItems = (await apifyItemsResponse.json()) as unknown
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
