export type NookType = 'cafe' | 'library' | 'coworking' | 'other'
export type FilterType = 'all' | NookType

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
}
