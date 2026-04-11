import { NextRequest, NextResponse } from 'next/server'
import {
  EMPTY_PASSPORT_CHECK_IN_SUMMARY,
  summarizePassportVisits,
  type PassportVisitRow,
} from '@/lib/passport'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
  placeId: string,
) {
  const { data, error } = await supabase
    .from('stamps')
    .select('id, nook_id, stamped_at')
    .eq('user_id', userId)
    .eq('nook_id', placeId)
    .order('stamped_at', { ascending: false })

  return {
    data: (data ?? []) as PassportVisitRow[],
    error,
  }
}

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId')?.trim()
  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })
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
    placeId,
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
  let body: { placeId?: string } | null = null

  try {
    body = (await request.json()) as { placeId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const placeId = body?.placeId?.trim()
  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })
  }

  const { supabase, user, error } = await getAuthenticatedContext()
  if (error || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to check in.' },
      { status: 401 },
    )
  }

  const { error: insertError } = await supabase.from('stamps').insert({
    user_id: user.id,
    nook_id: placeId,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { data, error: visitError } = await fetchVisitRows(
    supabase,
    user.id,
    placeId,
  )
  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 })
  }

  return NextResponse.json(summarizePassportVisits(data))
}
