export type NookType = 'cafe' | 'library' | 'coworking' | 'other'
export type FilterType = 'all' | NookType

export const NOOK_TYPE_LABELS: Record<NookType, string> = {
  cafe: 'café',
  library: 'library',
  coworking: 'coworking',
  other: 'other',
}

export interface NookPhoto {
  ref: string
  width: number
  height: number
}

export interface NookPlace {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  neighborhood?: string
  type: NookType
  rating?: number
  workSignals: string[]
  photo?: NookPhoto
}
