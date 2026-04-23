export type NookType = 'cafe' | 'library' | 'coworking' | 'other'
export type FilterType = 'all' | NookType

export const NOOK_TYPE_LABELS: Record<NookType, string> = {
  cafe: 'café',
  library: 'library',
  coworking: 'coworking',
  other: 'other',
}

export interface NookPlace {
  id: string
  slug: string
  overture_id: string
  name: string
  lat: number
  lng: number
  type: NookType
  address: string | null
  city: string | null
  region: string | null
  country: string | null
  website: string | null
  phone: string | null
  operating_status: string
  seed_run_id: string | null
}
