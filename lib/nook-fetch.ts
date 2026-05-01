import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { NookPlace, NookType } from '@/types/nook'

type NookRow = {
  id: string
  slug: string
  overture_id: string
  name: string
  lat: number
  lng: number
  type: string | null
  address: string | null
  city: string | null
  region: string | null
  country: string | null
  website: string | null
  phone: string | null
  operating_status: string | null
  seed_run_id: string | null
  nook_overrides?:
    | {
        address_override: string | null
        operating_status_override: string | null
      }[]
    | {
        address_override: string | null
        operating_status_override: string | null
      }
    | null
}

function toNookType(value: string | null): NookType {
  if (value === 'cafe' || value === 'library' || value === 'coworking') return value
  return 'other'
}

export async function fetchNookBySlug(slug: string): Promise<NookPlace | null> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('nooks')
    .select(`
      id,
      slug,
      overture_id,
      name,
      lat,
      lng,
      type,
      address,
      city,
      region,
      country,
      website,
      phone,
      operating_status,
      seed_run_id,
      nook_overrides (
        address_override,
        operating_status_override
      )
    `)
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null

  const row = data as NookRow
  const override = Array.isArray(row.nook_overrides)
    ? row.nook_overrides[0] ?? null
    : row.nook_overrides ?? null

  return {
    id: row.id,
    slug: row.slug,
    overture_id: row.overture_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    type: toNookType(row.type),
    address: override?.address_override ?? row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    website: row.website,
    phone: row.phone,
    operating_status:
      override?.operating_status_override ?? row.operating_status ?? 'active',
    seed_run_id: row.seed_run_id,
  }
}
