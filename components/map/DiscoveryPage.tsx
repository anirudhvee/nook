import { headers } from 'next/headers'
import { Suspense } from 'react'
import { DiscoveryMapLoader } from '@/components/map/DiscoveryMapLoader'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { NookPlace, NookType } from '@/types/nook'

const SF_FALLBACK: [number, number] = [-122.4194, 37.7749]

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
  nook_overrides?: {
    address_override: string | null
    operating_status_override: string | null
  }[] | {
    address_override: string | null
    operating_status_override: string | null
  } | null
}

function toNookType(value: string | null): NookType {
  if (value === 'cafe' || value === 'library' || value === 'coworking') return value
  return 'other'
}

async function getInitialSelectedNook(slug?: string | null): Promise<NookPlace | null> {
  if (!slug) return null

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
    ? (row.nook_overrides[0] ?? null)
    : (row.nook_overrides ?? null)
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
    operating_status: override?.operating_status_override ?? row.operating_status ?? 'active',
    seed_run_id: row.seed_run_id,
  }
}

export async function DiscoveryPage({ selectedNookSlug }: { selectedNookSlug?: string | null } = {}) {
  const h = await headers()
  const lat = parseFloat(h.get('x-vercel-ip-latitude') ?? '')
  const lng = parseFloat(h.get('x-vercel-ip-longitude') ?? '')
  const initialCenter: [number, number] =
    Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : SF_FALLBACK
  const initialSelectedNook = await getInitialSelectedNook(selectedNookSlug)

  return (
    <Suspense fallback={<div className="h-screen w-screen bg-muted" />}>
      <DiscoveryMapLoader initialCenter={initialCenter} initialSelectedNook={initialSelectedNook} />
    </Suspense>
  )
}
