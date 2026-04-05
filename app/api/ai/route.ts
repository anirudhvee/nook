import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const ALLOWED_SIGNALS = [
  'good wifi',
  'weak wifi',
  'no wifi',
  'plenty of outlets',
  'few outlets',
  'no outlets',
  'quiet',
  'moderate noise',
  'loud',
  'laptop-friendly',
  'not laptop-friendly',
] as const

type AllowedSignal = (typeof ALLOWED_SIGNALS)[number]

interface ReviewInput {
  text: string
  rating?: number | null
}

interface WorkSignalsRow {
  nook_id: string
  signals: AllowedSignal[]
  parsed_at: string
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

function isValidSignalArray(value: unknown): value is { signals: AllowedSignal[] } {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  if (!Array.isArray(candidate.signals)) return false

  return candidate.signals.every(
    signal => typeof signal === 'string' && ALLOWED_SIGNALS.includes(signal as AllowedSignal)
  )
}

function normalizeReviews(reviews: unknown): ReviewInput[] {
  if (!Array.isArray(reviews)) return []

  return reviews.flatMap(review => {
    if (!review || typeof review !== 'object') return []

    const candidate = review as Record<string, unknown>
    const textValue = typeof candidate.text === 'string' ? candidate.text.trim() : ''
    if (!textValue) return []

    const ratingValue =
      typeof candidate.rating === 'number'
        ? candidate.rating
        : typeof candidate.rating === 'string'
          ? Number.parseFloat(candidate.rating)
          : null

    return [
      {
        text: textValue,
        rating: Number.isFinite(ratingValue) ? ratingValue : null,
      },
    ]
  })
}

async function generateWorkSummary(reviews: ReviewInput[], openAiKey: string): Promise<string | null> {
  const reviewTranscript = reviews
    .map((review, index) => {
      const rating = review.rating != null ? `${review.rating}/5` : 'unknown'
      return `Review ${index + 1}\nRating: ${rating}\nText: ${review.text}`
    })
    .join('\n\n---\n\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'Write a 2-sentence work-friendliness summary based on the provided reviews. Start the first sentence with "People say". Focus on wifi, noise level, seating comfort, and overall atmosphere for working. Be factual and concise.',
        },
        {
          role: 'user',
          content: reviewTranscript,
        },
      ],
    }),
  })

  if (!response.ok) return null
  const completion = (await response.json()) as OpenAIChatResponse
  return completion.choices?.[0]?.message?.content?.trim() ?? null
}

export async function POST(req: Request) {
  let body: { place_id?: string; reviews?: unknown; generateSummary?: boolean } | null = null

  try {
    body = (await req.json()) as { place_id?: string; reviews?: unknown; generateSummary?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const placeId = body?.place_id?.trim()
  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 })
  }

  const generateSummary = body?.generateSummary === true
  const reviews = normalizeReviews(body?.reviews)

  const supabase = await createServiceClient()
  const { data: existingSignals, error: existingSignalsError } = await supabase
    .from('work_signals')
    .select('nook_id, signals, parsed_at')
    .eq('nook_id', placeId)
    .maybeSingle()

  if (existingSignalsError) {
    return NextResponse.json({ error: existingSignalsError.message }, { status: 500 })
  }

  if (existingSignals) {
    if (generateSummary && reviews.length > 0) {
      const openAiKey = process.env.OPENAI_API_KEY
      if (openAiKey) {
        const summary = await generateWorkSummary(reviews, openAiKey)
        return NextResponse.json({ signals: existingSignals.signals ?? [], summary, cached: true })
      }
    }
    return NextResponse.json({ signals: existingSignals.signals ?? [], cached: true })
  }

  const parsedAt = new Date().toISOString()

  if (reviews.length === 0) {
    const { data: storedSignals, error: storeError } = await supabase
      .from('work_signals')
      .upsert(
        {
          nook_id: placeId,
          signals: [],
          parsed_at: parsedAt,
        },
        { onConflict: 'nook_id' }
      )
      .select('nook_id, signals, parsed_at')
      .single()

    if (storeError) {
      return NextResponse.json({ error: storeError.message }, { status: 500 })
    }

    return NextResponse.json({ signals: storedSignals.signals ?? [], cached: false })
  }

  const openAiKey = process.env.OPENAI_API_KEY
  if (!openAiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const reviewTranscript = reviews
    .map((review, index) => {
      const rating = review.rating != null ? `${review.rating}/5` : 'unknown'
      return `Review ${index + 1}\nRating: ${rating}\nText: ${review.text}`
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
          content: `Extract only work signals that are explicitly mentioned in the reviews. Return JSON only. Omit anything uncertain, implied, or unsupported. Allowed signal strings: ${ALLOWED_SIGNALS.join(', ')}.`,
        },
        {
          role: 'user',
          content: `For place_id "${placeId}", extract explicit work signals from these reviews.\n\n${reviewTranscript}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'work_signal_pills',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              signals: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ALLOWED_SIGNALS,
                },
              },
            },
            required: ['signals'],
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

  let parsedSignals: AllowedSignal[]
  try {
    const parsed = JSON.parse(rawContent) as unknown
    if (!isValidSignalArray(parsed)) {
      return NextResponse.json({ error: 'OpenAI returned unexpected signal values' }, { status: 502 })
    }

    parsedSignals = parsed.signals
  } catch {
    return NextResponse.json({ error: 'OpenAI returned invalid JSON' }, { status: 502 })
  }

  const [storedResult, summary] = await Promise.all([
    supabase
      .from('work_signals')
      .upsert(
        {
          nook_id: placeId,
          signals: parsedSignals,
          parsed_at: parsedAt,
        },
        { onConflict: 'nook_id' }
      )
      .select('nook_id, signals, parsed_at')
      .single(),
    generateSummary ? generateWorkSummary(reviews, openAiKey) : Promise.resolve(null),
  ])

  if (storedResult.error) {
    return NextResponse.json({ error: storedResult.error.message }, { status: 500 })
  }

  return NextResponse.json({ signals: storedResult.data.signals ?? [], summary, cached: false })
}
