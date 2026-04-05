import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

interface ReviewRow {
  nook_id: string
  review_text: string | null
  rating: number | null
  reviewed_at: string | null
  fetched_at: string
}

interface WorkSignalsRow {
  nook_id: string
  wifi_signal: 'good' | 'weak' | 'none' | null
  outlet_signal: 'plenty' | 'few' | 'none' | null
  noise_signal: 'quiet' | 'moderate' | 'loud' | null
  laptop_signal: 'yes' | 'no' | null
  parsed_at: string
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

function isValidSignals(value: unknown): value is Omit<WorkSignalsRow, 'nook_id' | 'parsed_at'> {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return (
    ['good', 'weak', 'none'].includes(String(candidate.wifi_signal)) &&
    ['plenty', 'few', 'none'].includes(String(candidate.outlet_signal)) &&
    ['quiet', 'moderate', 'loud'].includes(String(candidate.noise_signal)) &&
    ['yes', 'no'].includes(String(candidate.laptop_signal))
  )
}

function getLatestBatch(rows: ReviewRow[]): ReviewRow[] {
  const latestFetchedAt = rows[0]?.fetched_at
  return latestFetchedAt ? rows.filter(row => row.fetched_at === latestFetchedAt) : []
}

function emptySignals(placeId: string, parsedAt: string): WorkSignalsRow {
  return {
    nook_id: placeId,
    wifi_signal: null,
    outlet_signal: null,
    noise_signal: null,
    laptop_signal: null,
    parsed_at: parsedAt,
  }
}

export async function POST(req: Request) {
  let body: { place_id?: string } | null = null

  try {
    body = (await req.json()) as { place_id?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const placeId = body?.place_id?.trim()
  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 })
  }

  const openAiKey = process.env.OPENAI_API_KEY
  if (!openAiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const supabase = await createServiceClient()
  const { data: reviewRows, error: reviewError } = await supabase
    .from('reviews')
    .select('nook_id, review_text, rating, reviewed_at, fetched_at')
    .eq('nook_id', placeId)
    .order('fetched_at', { ascending: false })
    .order('reviewed_at', { ascending: false, nullsFirst: false })

  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 })
  }

  const { data: existingSignals, error: existingSignalsError } = await supabase
    .from('work_signals')
    .select('nook_id, wifi_signal, outlet_signal, noise_signal, laptop_signal, parsed_at')
    .eq('nook_id', placeId)
    .maybeSingle()

  if (existingSignalsError) {
    return NextResponse.json({ error: existingSignalsError.message }, { status: 500 })
  }

  const latestReviewBatch = getLatestBatch((reviewRows ?? []) as ReviewRow[])
  const latestFetchedAt = latestReviewBatch[0]?.fetched_at
  if (
    existingSignals &&
    (!latestFetchedAt || new Date(existingSignals.parsed_at).getTime() >= new Date(latestFetchedAt).getTime())
  ) {
    return NextResponse.json({ signals: existingSignals, cached: true })
  }

  const parsedAt = new Date().toISOString()
  if (latestReviewBatch.length === 0) {
    const fallbackSignals = emptySignals(placeId, parsedAt)
    const { data: storedSignals, error: upsertError } = await supabase
      .from('work_signals')
      .upsert(fallbackSignals, { onConflict: 'nook_id' })
      .select('nook_id, wifi_signal, outlet_signal, noise_signal, laptop_signal, parsed_at')
      .single()

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ signals: storedSignals, cached: false })
  }

  const reviewTranscript = latestReviewBatch
    .map((review, index) => {
      const rating = review.rating != null ? `${review.rating}/5` : 'unknown'
      const reviewedAt = review.reviewed_at ?? 'unknown'
      const reviewText = review.review_text ?? ''
      return `Review ${index + 1}\nRating: ${rating}\nReviewed at: ${reviewedAt}\nText: ${reviewText}`
    })
    .join('\n\n---\n\n')

  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You extract workability signals from Google Maps reviews for remote workers. Return only JSON that matches the schema. Use conservative defaults: if evidence is missing or mixed, choose the less optimistic option. wifi_signal values: good, weak, none. outlet_signal values: plenty, few, none. noise_signal values: quiet, moderate, loud. laptop_signal values: yes, no.',
        },
        {
          role: 'user',
          content: `Extract work signals for place_id "${placeId}" from these Google Maps reviews.\n\n${reviewTranscript}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'work_signals',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              wifi_signal: {
                type: 'string',
                enum: ['good', 'weak', 'none'],
              },
              outlet_signal: {
                type: 'string',
                enum: ['plenty', 'few', 'none'],
              },
              noise_signal: {
                type: 'string',
                enum: ['quiet', 'moderate', 'loud'],
              },
              laptop_signal: {
                type: 'string',
                enum: ['yes', 'no'],
              },
            },
            required: ['wifi_signal', 'outlet_signal', 'noise_signal', 'laptop_signal'],
          },
        },
      },
    }),
  })

  if (!openAiResponse.ok) {
    const text = await openAiResponse.text()
    return NextResponse.json({ error: text }, { status: openAiResponse.status })
  }

  const completion = (await openAiResponse.json()) as OpenAIChatResponse
  const rawContent = completion.choices?.[0]?.message?.content
  if (!rawContent) {
    return NextResponse.json({ error: 'OpenAI returned an empty response' }, { status: 502 })
  }

  let parsedSignals: Omit<WorkSignalsRow, 'nook_id' | 'parsed_at'>
  try {
    const parsed = JSON.parse(rawContent) as unknown
    if (!isValidSignals(parsed)) {
      return NextResponse.json({ error: 'OpenAI returned unexpected signal values' }, { status: 502 })
    }

    parsedSignals = parsed
  } catch {
    return NextResponse.json({ error: 'OpenAI returned invalid JSON' }, { status: 502 })
  }

  const rowToStore: WorkSignalsRow = {
    nook_id: placeId,
    wifi_signal: parsedSignals.wifi_signal,
    outlet_signal: parsedSignals.outlet_signal,
    noise_signal: parsedSignals.noise_signal,
    laptop_signal: parsedSignals.laptop_signal,
    parsed_at: parsedAt,
  }

  const { data: storedSignals, error: storeError } = await supabase
    .from('work_signals')
    .upsert(rowToStore, { onConflict: 'nook_id' })
    .select('nook_id, wifi_signal, outlet_signal, noise_signal, laptop_signal, parsed_at')
    .single()

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 })
  }

  return NextResponse.json({ signals: storedSignals, cached: false })
}
