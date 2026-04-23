import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const WORKFLOW_ID = 'seed-region.yml'
const WORKFLOW_DISPATCH_TIMEOUT_MS = 10_000

interface SeedTriggerBody {
  bbox?: unknown
  cityName?: unknown
  force?: unknown
}

interface SeededRegionClaimRow {
  status: 'pending' | 'seeding' | 'complete' | 'failed'
  venue_count: number | null
  triggered_at: string
  should_dispatch: boolean
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

function compareSeedSecret(receivedSecret: string | null, configuredSecret: string) {
  if (!receivedSecret) {
    return false
  }

  const receivedHash = createHash('sha256').update(receivedSecret).digest()
  const configuredHash = createHash('sha256').update(configuredSecret).digest()

  return timingSafeEqual(receivedHash, configuredHash)
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null
  }

  return request.headers.get('x-real-ip')
}

function getWorkflowRef(): string {
  const rawRef = (
    process.env.GITHUB_WORKFLOW_REF ??
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.GITHUB_REF_NAME ??
    'main'
  )

  return rawRef
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/tags\//, '')
}

async function markRegionFailed(
  bbox: string,
  cityName: string | null,
  claimTriggeredAt: string,
  message: string,
) {
  const supabase = createAdminSupabaseClient()
  const updatePayload: {
    status: 'failed'
    completed_at: string
    city_name?: string
  } = {
    status: 'failed',
    completed_at: new Date().toISOString(),
  }

  if (cityName !== null) {
    updatePayload.city_name = cityName
  }

  const { data, error } = await supabase
    .from('seeded_regions')
    .update(updatePayload)
    .eq('bbox_key', bbox)
    .eq('triggered_at', claimTriggeredAt)
    .select('bbox_key')
    .maybeSingle()

  if (error) {
    console.error('Failed to mark seeded region as failed', {
      bbox,
      cityName,
      claimTriggeredAt,
      error: error.message,
      originalMessage: message,
    })
  } else if (!data) {
    console.warn('Skipped marking seeded region as failed because claim is no longer active', {
      bbox,
      cityName,
      claimTriggeredAt,
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

  if (!compareSeedSecret(getSeedSecret(request), configuredSecret)) {
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
    const parsedBody = await request.json()
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    body = parsedBody as SeedTriggerBody
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
  const force = body.force === true

  const supabase = createAdminSupabaseClient()
  const { data: claimedRegion, error: claimError } = await supabase
    .rpc('claim_seeded_region', {
      p_bbox_key: bboxKey,
      p_city_name: cityName,
      p_triggered_by_ip: getClientIp(request),
      p_force: force,
    })
    .single<SeededRegionClaimRow>()

  if (claimError || !claimedRegion) {
    console.error('Unable to claim seeded region', {
      bbox: bboxKey,
      cityName,
      error: claimError?.message ?? null,
    })
    return NextResponse.json(
      { error: 'Unable to claim seeded region.' },
      { status: 500 },
    )
  }

  if (!claimedRegion.should_dispatch) {
    return NextResponse.json({
      status: claimedRegion.status,
      message: claimedRegion.status === 'complete'
        ? 'This area has already been seeded.'
        : 'Finding nooks in this area...',
      venueCount: claimedRegion.venue_count ?? 0,
    })
  }

  let dispatchResponse: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WORKFLOW_DISPATCH_TIMEOUT_MS)
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
            bbox,
            bbox_key: bboxKey,
            city_name: cityName ?? '',
            claim_triggered_at: claimedRegion.triggered_at,
          },
        }),
        signal: controller.signal,
      },
    )
  } catch (error) {
    console.error('GitHub workflow dispatch request failed', {
      bbox: bboxKey,
      cityName,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return markRegionFailed(
      bboxKey,
      cityName,
      claimedRegion.triggered_at,
      'Unable to trigger seed workflow.',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!dispatchResponse.ok) {
    const errorText = await dispatchResponse.text()
    console.error('GitHub workflow dispatch failed', {
      bbox: bboxKey,
      cityName,
      status: dispatchResponse.status,
      statusText: dispatchResponse.statusText,
      error: errorText || null,
    })
    return markRegionFailed(
      bboxKey,
      cityName,
      claimedRegion.triggered_at,
      'Unable to trigger seed workflow.',
    )
  }

  return NextResponse.json({
    status: 'seeding',
    message: 'Finding nooks in this area...',
  })
}
