export interface GooglePlacesAddressComponent {
  longText: string
  shortText: string
  types?: string[]
}

export function extractNeighborhood(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  const match =
    components.find(component => component.types?.includes('neighborhood')) ??
    components.find(component => component.types?.includes('sublocality_level_1')) ??
    components.find(component => component.types?.includes('sublocality'))

  return match?.longText
}

export function extractCity(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  const match =
    components.find(component => component.types?.includes('locality')) ??
    components.find(component => component.types?.includes('postal_town'))

  return match?.longText
}

export function extractRegion(
  components: GooglePlacesAddressComponent[],
): string | undefined {
  return components.find(component =>
    component.types?.includes('administrative_area_level_1')
  )?.shortText
}

export function buildPassportLocationLine({
  neighborhood,
  city,
  region,
}: {
  neighborhood?: string
  city?: string
  region?: string
}): string {
  if (neighborhood && city) return `${neighborhood}, ${city}`
  if (city && region) return `${city}, ${region}`
  if (city) return city
  if (neighborhood) return neighborhood
  if (region) return region
  return 'Location unavailable'
}
