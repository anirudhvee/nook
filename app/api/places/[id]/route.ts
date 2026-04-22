import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { NookType } from '@/types/nook'

type AddressComponent = {
  longText: string
  shortText: string
  types: string[]
}

type NookDetailsRow = {
  google_maps_url: string | null
  community_hours: unknown
}

type NookOverrideRow = {
  address_override: string | null
  operating_status_override: string | null
}

type WorkSignalSummaryRow = {
  report_count: number
  wifi_great: number
  wifi_okay: number
  wifi_none: number
  outlets_plenty: number
  outlets_few: number
  outlets_none: number
  noise_silent: number
  noise_quiet: number
  noise_moderate: number
  noise_loud: number
  laptop_friendly_yes: number
  laptop_friendly_no: number
  top_tags: string[] | null
  updated_at: string | null
}

type NookRow = {
  id: string
  slug: string
  overture_id: string
  name: string
  lat: number
  lng: number
  address: string | null
  type: NookType | string | null
  website: string | null
  phone: string | null
  operating_status: string | null
  seed_run_id: string | null
  neighborhood: string | null
  city: string | null
  region: string | null
  country: string | null
  nook_overrides?: NookOverrideRow | NookOverrideRow[] | null
  nook_details?: NookDetailsRow | NookDetailsRow[] | null
  work_signal_summary?: WorkSignalSummaryRow | WorkSignalSummaryRow[] | null
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toNookType(value: string | null): NookType {
  if (value === 'cafe' || value === 'library' || value === 'coworking') return value
  return 'other'
}

function toLegacyTypes(type: NookType): string[] {
  switch (type) {
    case 'cafe':
      return ['cafe']
    case 'library':
      return ['library']
    case 'coworking':
      return ['coworking_space']
    default:
      return []
  }
}

function buildAddressComponents(row: NookRow): AddressComponent[] {
  const components: AddressComponent[] = []

  if (row.neighborhood) {
    components.push({
      longText: row.neighborhood,
      shortText: row.neighborhood,
      types: ['neighborhood'],
    })
  }

  if (row.city) {
    components.push({
      longText: row.city,
      shortText: row.city,
      types: ['locality'],
    })
  }

  if (row.region) {
    components.push({
      longText: row.region,
      shortText: row.region,
      types: ['administrative_area_level_1'],
    })
  }

  if (row.country) {
    components.push({
      longText: row.country,
      shortText: row.country,
      types: ['country'],
    })
  }

  return components
}

function winningSignal(
  entries: Array<{ label: string; count: number }>,
): string | null {
  const sorted = entries
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return sorted[0]?.label ?? null
}

function buildWorkSignals(summary: WorkSignalSummaryRow | null): string[] {
  if (!summary || summary.report_count <= 0) return []

  const signals = [
    winningSignal([
      { label: 'great wifi', count: summary.wifi_great },
      { label: 'okay wifi', count: summary.wifi_okay },
      { label: 'no wifi', count: summary.wifi_none },
    ]),
    winningSignal([
      { label: 'plenty of outlets', count: summary.outlets_plenty },
      { label: 'some outlets', count: summary.outlets_few },
      { label: 'no outlets', count: summary.outlets_none },
    ]),
    winningSignal([
      { label: 'silent', count: summary.noise_silent },
      { label: 'quiet', count: summary.noise_quiet },
      { label: 'moderate noise', count: summary.noise_moderate },
      { label: 'loud', count: summary.noise_loud },
    ]),
    winningSignal([
      { label: 'laptop friendly', count: summary.laptop_friendly_yes },
      { label: 'not laptop friendly', count: summary.laptop_friendly_no },
    ]),
  ].filter((signal): signal is string => Boolean(signal))

  for (const tag of summary.top_tags ?? []) {
    if (tag && !signals.includes(tag)) signals.push(tag)
  }

  return signals.slice(0, 6)
}

function buildReviewSummary(
  summary: WorkSignalSummaryRow | null,
  signals: string[],
) {
  if (!summary || summary.report_count <= 0 || signals.length === 0) {
    return null
  }

  const reportLabel = summary.report_count === 1 ? 'report' : 'reports'
  return {
    text: {
      text: `Nook community ${reportLabel} mention ${signals.slice(0, 3).join(', ')}.`,
      languageCode: 'en',
    },
    disclosureText: {
      text: `Based on ${summary.report_count} community ${reportLabel}`,
      languageCode: 'en',
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildOpeningHours(communityHours: unknown):
  | { openNow?: boolean; weekdayDescriptions?: string[] }
  | undefined {
  if (Array.isArray(communityHours) && communityHours.every(item => typeof item === 'string')) {
    return { weekdayDescriptions: communityHours }
  }

  if (!isRecord(communityHours)) return undefined

  const rawDescriptions = communityHours.weekdayDescriptions ?? communityHours.weekday_descriptions
  const weekdayDescriptions = Array.isArray(rawDescriptions)
    ? rawDescriptions.filter((item): item is string => typeof item === 'string')
    : undefined
  const openNow = typeof communityHours.openNow === 'boolean'
    ? communityHours.openNow
    : typeof communityHours.open_now === 'boolean'
      ? communityHours.open_now
      : undefined

  if (openNow == null && (!weekdayDescriptions || weekdayDescriptions.length === 0)) {
    return undefined
  }

  return { openNow, weekdayDescriptions }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

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
      address,
      type,
      website,
      phone,
      operating_status,
      seed_run_id,
      neighborhood,
      city,
      region,
      country,
      nook_overrides (
        address_override,
        operating_status_override
      ),
      nook_details (
        google_maps_url,
        community_hours
      ),
      work_signal_summary (
        report_count,
        wifi_great,
        wifi_okay,
        wifi_none,
        outlets_plenty,
        outlets_few,
        outlets_none,
        noise_silent,
        noise_quiet,
        noise_moderate,
        noise_loud,
        laptop_friendly_yes,
        laptop_friendly_no,
        top_tags,
        updated_at
      )
    `)
    .eq('slug', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Nook not found' }, { status: 404 })
  }

  const row = data as NookRow
  const override = firstRelation(row.nook_overrides)
  const nookType = toNookType(row.type)
  const details = firstRelation(row.nook_details)
  const signalSummary = firstRelation(row.work_signal_summary)
  const workSignals = buildWorkSignals(signalSummary)
  const reviewSummary = buildReviewSummary(signalSummary, workSignals)
  const regularOpeningHours = buildOpeningHours(details?.community_hours)
  const effectiveAddress = override?.address_override ?? row.address
  const effectiveOperatingStatus = override?.operating_status_override ?? row.operating_status ?? 'active'

  return NextResponse.json({
    id: row.id,
    slug: row.slug,
    overture_id: row.overture_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: effectiveAddress,
    type: nookType,
    city: row.city,
    region: row.region,
    country: row.country,
    website: row.website,
    phone: row.phone,
    operating_status: effectiveOperatingStatus,
    seed_run_id: row.seed_run_id,
    neighborhood: row.neighborhood,
    google_maps_url: details?.google_maps_url ?? null,
    googleMapsUrl: details?.google_maps_url ?? null,
    nook_details: details,
    displayName: {
      text: row.name,
      languageCode: 'en',
    },
    formattedAddress: effectiveAddress ?? '',
    addressComponents: buildAddressComponents(row),
    location: {
      latitude: row.lat,
      longitude: row.lng,
    },
    rating: null,
    types: toLegacyTypes(nookType),
    reviews: [],
    workSignals,
    reviewSummary,
    regularOpeningHours,
    work_signal_summary: signalSummary,
    workSignalSummary: signalSummary,
  })
}
