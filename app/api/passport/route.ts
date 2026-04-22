import { NextResponse } from 'next/server'
import {
  buildPassportLocationLine,
  groupPassportVisits,
  type PassportPlacePreview,
  type PassportStampRecord,
  type PassportVisitRow,
} from '@/lib/passport'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { NookType } from '@/types/nook'

type PassportNookRow = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string | null
  region: string | null
  country: string | null
  type: NookType | string | null
  lat: number | null
  lng: number | null
}

interface PassportStampRow extends PassportVisitRow {
  nook: PassportNookRow | PassportNookRow[] | null
}

function toNookType(value: string | null): NookType {
  if (value === 'cafe' || value === 'library' || value === 'coworking') return value
  return 'other'
}

function toPassportPlacePreview(
  row: PassportNookRow,
): PassportPlacePreview {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    locationLine: buildPassportLocationLine(row),
    type: toNookType(row.type),
    lat: row.lat,
    lng: row.lng,
  }
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
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
    .select(`
      id,
      nook_id,
      stamped_at,
      nook:nooks (
        id,
        slug,
        name,
        address,
        city,
        region,
        country,
        type,
        lat,
        lng
      )
    `)
    .eq('user_id', user.id)
    .order('stamped_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stampRows = (data ?? []) as PassportStampRow[]
  const visitRows: PassportVisitRow[] = stampRows.map(row => ({
    id: row.id,
    nook_id: row.nook_id,
    stamped_at: row.stamped_at,
  }))
  const groupedStamps = groupPassportVisits(visitRows)

  const previewMap = new Map(
    stampRows.flatMap(row => {
      const nook = firstRelation(row.nook)
      if (!nook) return []
      return [[row.nook_id, toPassportPlacePreview(nook)] as const]
    }),
  )
  const stamps: PassportStampRecord[] = groupedStamps.map(stamp => ({
    ...stamp,
    place: previewMap.get(stamp.nookId) ?? null,
  }))

  return NextResponse.json({
    stamps,
    totalCheckIns: visitRows.length,
  })
}
