import type {
  NookPhoto,
  NookPhotoAuthorAttribution,
} from '@/types/nook'

type GooglePlacePhoto = {
  name: string
  widthPx: number
  heightPx: number
  authorAttributions?: NookPhotoAuthorAttribution[]
}

export const DEFAULT_PLACE_PHOTO_WIDTH = 400
export const MAX_PLACE_PHOTO_WIDTH = 1600

export function isValidPlacePhotoRef(ref: string): boolean {
  if (ref.includes('?') || ref.includes('#') || ref.includes('\\')) {
    return false
  }

  const segments = ref.split('/')
  return (
    segments.length === 4 &&
    segments[0] === 'places' &&
    segments[2] === 'photos' &&
    segments[1].length > 0 &&
    segments[3].length > 0 &&
    !segments.some(segment => segment === '.' || segment === '..')
  )
}

export function parsePlacePhotoMaxWidth(rawWidth: string | null): number {
  if (!rawWidth) return DEFAULT_PLACE_PHOTO_WIDTH
  if (!/^\d+$/.test(rawWidth)) return DEFAULT_PLACE_PHOTO_WIDTH

  const width = Number.parseInt(rawWidth, 10)
  return Math.min(Math.max(width, 1), MAX_PLACE_PHOTO_WIDTH)
}

export function pickPrimaryPhoto(
  photos?: GooglePlacePhoto[],
): NookPhoto | undefined {
  const photo = photos?.[0]
  if (!photo) return undefined

  return {
    ref: photo.name,
    width: photo.widthPx,
    height: photo.heightPx,
    authorAttributions: photo.authorAttributions ?? [],
  }
}

export function buildPlacePhotoUrl(ref: string, maxWidth = 400): string {
  const qs = new URLSearchParams({
    ref,
    maxWidth: String(maxWidth),
  })

  return `/api/places/photo?${qs.toString()}`
}
