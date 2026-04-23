import { NextRequest, NextResponse } from 'next/server'
import {
  EMPTY_PASSPORT_CHECK_IN_SUMMARY,
  summarizePassportVisits,
  type PassportVisitRow,
} from '@/lib/passport'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const RECENT_CHECK_IN_ERROR =
  'You already checked in here recently. Try again later.'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function getAuthenticatedContext() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return { supabase, user, error }
}

async function fetchVisitRows(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  nookId: string,
) {
  const { data, error } = await supabase
    .from('stamps')
    .select('id, nook_id, stamped_at')
    .eq('user_id', userId)
    .eq('nook_id', nookId)
    .order('stamped_at', { ascending: false })

  return {
    data: (data ?? []) as PassportVisitRow[],
    error,
  }
}

export async function GET(request: NextRequest) {
  const nookId = request.nextUrl.searchParams.get('nookId')?.trim()
  if (!nookId) {
    return NextResponse.json({ error: 'Missing nookId' }, { status: 400 })
  }

  if (!UUID_PATTERN.test(nookId)) {
    return NextResponse.json({ error: 'Invalid nookId' }, { status: 400 })
  }

  const { supabase, user, error } = await getAuthenticatedContext()
  if (error || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to view Passport visits.' },
      { status: 401 },
    )
  }

  const { data, error: visitError } = await fetchVisitRows(
    supabase,
    user.id,
    nookId,
  )
  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 })
  }

  const summary =
    data.length > 0
      ? summarizePassportVisits(data)
      : EMPTY_PASSPORT_CHECK_IN_SUMMARY

  return NextResponse.json(summary)
}

export async function POST(request: NextRequest) {
  let body: { nookId?: string } | null = null

  try {
    body = (await request.json()) as { nookId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const nookId = body?.nookId?.trim()
  if (!nookId) {
    return NextResponse.json({ error: 'Missing nookId' }, { status: 400 })
  }

  if (!UUID_PATTERN.test(nookId)) {
    return NextResponse.json({ error: 'Invalid nookId' }, { status: 400 })
  }

  const { supabase, user, error } = await getAuthenticatedContext()
  if (error || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to check in.' },
      { status: 401 },
    )
  }

  const { data: checkInCreated, error: checkInError } = await supabase.rpc(
    'create_passport_check_in',
    {
      nook_id: nookId,
    },
  )

  if (checkInError) {
    return NextResponse.json({ error: checkInError.message }, { status: 500 })
  }

  if (!checkInCreated) {
    return NextResponse.json({ error: RECENT_CHECK_IN_ERROR }, { status: 429 })
  }

  const { data, error: visitError } = await fetchVisitRows(
    supabase,
    user.id,
    nookId,
  )
  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 })
  }

  return NextResponse.json(summarizePassportVisits(data))
}
