import type { NookPhoto } from '@/types/nook'

type GooglePlacePhoto = {
  name: string
  widthPx: number
  heightPx: number
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
  }
}

export function buildPlacePhotoUrl(ref: string, maxWidth = 400): string {
  const qs = new URLSearchParams({
    ref,
    maxWidth: String(maxWidth),
  })

  return `/api/places/photo?${qs.toString()}`
}
