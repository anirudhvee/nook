import { NextResponse } from 'next/server'
import { fetchGooglePlacePreview } from '@/lib/google-places'
import {
  groupPassportVisits,
  type PassportStampRecord,
  type PassportVisitRow,
} from '@/lib/passport'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function fetchInBatches<T>(
  ids: string[],
  batchSize: number,
  fn: (id: string) => Promise<T>,
): Promise<Array<readonly [string, T]>> {
  const results: Array<readonly [string, T]> = []

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize)
    const batchResults = await Promise.all(
      batch.map(async id => [id, await fn(id)] as const),
    )

    results.push(...batchResults)
  }

  return results
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to view Passport.' },
      { status: 401 },
    )
  }

  const { data, error } = await supabase
    .from('stamps')
    .select('id, nook_id, stamped_at')
    .eq('user_id', user.id)
    .order('stamped_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const visitRows = (data ?? []) as PassportVisitRow[]
  const groupedStamps = groupPassportVisits(visitRows)

  const stampPreviewEntries = await fetchInBatches(
    groupedStamps.map(stamp => stamp.nookId),
    5,
    fetchGooglePlacePreview,
  )

  const previewMap = new Map(stampPreviewEntries)
  const stamps: PassportStampRecord[] = groupedStamps.map(stamp => ({
    ...stamp,
    place: previewMap.get(stamp.nookId) ?? null,
  }))

  return NextResponse.json({
    stamps,
    totalCheckIns: visitRows.length,
  })
}
