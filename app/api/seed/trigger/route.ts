import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const WORKFLOW_ID = 'seed-region.yml'

interface SeedTriggerBody {
  bbox?: unknown
  cityName?: unknown
}

interface SeededRegionRow {
  status: 'pending' | 'seeding' | 'complete' | 'failed'
  venue_count: number | null
}

function parseBbox(value: string): [number, number, number, number] | null {
  const parts = value.split(',').map(part => Number(part.trim()))
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
    return null
  }

  const [minx, miny, maxx, maxy] = parts
  if (minx >= maxx || miny >= maxy) {
    return null
  }

  return [minx, miny, maxx, maxy]
}

const normalizeBboxKey = (bbox: string): string => {
  return bbox
    .split(',')
    .map(v => parseFloat(v).toFixed(2))
    .join(',')
}

function getSeedSecret(request: NextRequest): string | null {
  return (
    request.headers.get('seed_trigger_secret') ??
    request.headers.get('seed-trigger-secret') ??
    request.headers.get('x-seed-trigger-secret')
  )
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null
  }

  return request.headers.get('x-real-ip')
}

function getWorkflowRef(): string {
  return (
    process.env.GITHUB_WORKFLOW_REF ??
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.GITHUB_REF_NAME ??
    'main'
  )
}

async function markRegionFailed(
  bbox: string,
  cityName: string | null,
  message: string,
) {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('seeded_regions')
    .upsert(
      {
        bbox_key: bbox,
        city_name: cityName,
        status: 'failed',
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'bbox_key' },
    )

  if (error) {
    console.error('Failed to mark seeded region as failed', {
      bbox,
      cityName,
      error: error.message,
      originalMessage: message,
    })
  }

  return NextResponse.json({ error: message }, { status: 502 })
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.SEED_TRIGGER_SECRET
  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'Seed trigger secret is not configured.' },
      { status: 500 },
    )
  }

  if (getSeedSecret(request) !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const githubToken = process.env.GITHUB_TOKEN
  const githubOwner = process.env.GITHUB_REPO_OWNER
  const githubRepo = process.env.GITHUB_REPO_NAME
  if (!githubToken || !githubOwner || !githubRepo) {
    return NextResponse.json(
      { error: 'GitHub workflow dispatch is not configured.' },
      { status: 500 },
    )
  }

  let body: SeedTriggerBody
  try {
    body = (await request.json()) as SeedTriggerBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const bbox = typeof body.bbox === 'string' ? body.bbox.trim() : ''
  if (!bbox || !parseBbox(bbox)) {
    return NextResponse.json(
      { error: 'bbox must be formatted as minx,miny,maxx,maxy.' },
      { status: 400 },
    )
  }
  const bboxKey = normalizeBboxKey(bbox)

  const cityName =
    typeof body.cityName === 'string' && body.cityName.trim()
      ? body.cityName.trim()
      : null

  const supabase = createAdminSupabaseClient()
  const { data: existingRegion, error: existingError } = await supabase
    .from('seeded_regions')
    .select('status, venue_count')
    .eq('bbox_key', bboxKey)
    .maybeSingle<SeededRegionRow>()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (
    existingRegion &&
    ['pending', 'seeding', 'complete'].includes(existingRegion.status)
  ) {
    return NextResponse.json({
      status: existingRegion.status === 'complete' ? 'complete' : 'seeding',
      message:
        existingRegion.status === 'complete'
          ? 'This area has already been seeded.'
          : 'Finding nooks in this area...',
      venueCount: existingRegion.venue_count ?? 0,
    })
  }

  const { error: seedRegionError } = await supabase
    .from('seeded_regions')
    .upsert(
      {
        bbox_key: bboxKey,
        city_name: cityName,
        status: 'pending',
        venue_count: 0,
        triggered_at: new Date().toISOString(),
        completed_at: null,
        triggered_by_ip: getClientIp(request),
      },
      { onConflict: 'bbox_key' },
    )

  if (seedRegionError) {
    return NextResponse.json({ error: seedRegionError.message }, { status: 500 })
  }

  let dispatchResponse: Response
  try {
    dispatchResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(githubOwner)}/${encodeURIComponent(githubRepo)}/actions/workflows/${encodeURIComponent(WORKFLOW_ID)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        body: JSON.stringify({
          ref: getWorkflowRef(),
          inputs: {
            bbox: bboxKey,
            city_name: cityName ?? '',
          },
        }),
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to trigger seed workflow.'
    return markRegionFailed(bboxKey, cityName, message)
  }

  if (!dispatchResponse.ok) {
    const errorText = await dispatchResponse.text()
    return markRegionFailed(
      bboxKey,
      cityName,
      errorText || 'Unable to trigger seed workflow.',
    )
  }

  return NextResponse.json({
    status: 'seeding',
    message: 'Finding nooks in this area...',
  })
}
