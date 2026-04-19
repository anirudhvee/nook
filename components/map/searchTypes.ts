export type SearchContext = {
  country?: {
    name?: string
    country_code?: string
    country_code_alpha_3?: string
  }
  region?: {
    name?: string
    region_code?: string
    region_code_full?: string
  }
  place?: {
    name?: string
  }
  locality?: {
    name?: string
  }
  district?: {
    name?: string
  }
  neighborhood?: {
    name?: string
  }
  postcode?: {
    name?: string
  }
}

export type SearchSuggestion = {
  id: string
  placeId: string
  osmType?: string
  osmId?: string
  name: string
  namePreferred: string
  featureType: string
  address: string
  fullAddress: string
  placeFormatted: string
  context: SearchContext
  lat: number
  lng: number
  category: string
  type: string
  importance: number
  placeRank: number | null
}

export type GeoapifyAutocompleteResponse = {
  results?: GeoapifyAutocompleteResult[]
}

export type GeoapifyAutocompleteResult = {
  place_id?: string
  lat: number
  lon: number
  formatted: string
  address_line1?: string
  address_line2?: string
  name?: string
  housenumber?: string
  street?: string
  city?: string
  town?: string
  village?: string
  hamlet?: string
  municipality?: string
  county?: string
  district?: string
  suburb?: string
  neighbourhood?: string
  neighborhood?: string
  state?: string
  state_code?: string
  postcode?: string
  country?: string
  country_code?: string
  result_type?: string
  category?: string
  rank?: {
    confidence?: number
    importance?: number
    popularity?: number
  }
  datasource?: {
    raw?: {
      osm_id?: string | number
      osm_type?: string
      place_id?: string | number
      type?: string
      category?: string
      name?: string
    }
  }
}

function firstDefined(values: Array<string | undefined>): string {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function buildStreetAddress(result: GeoapifyAutocompleteResult): string {
  const houseNumber = result.housenumber?.trim()
  const street = result.street?.trim()

  if (houseNumber && street) return `${houseNumber} ${street}`
  if (street) return street

  return ''
}

function trimLeadingSegment(value: string, segment: string): string {
  if (!segment) return value

  const prefix = `${segment}, `
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function buildPlaceFormatted(
  result: GeoapifyAutocompleteResult,
  primaryLabel: string,
  streetAddress: string
): string {
  const addressLine2 = result.address_line2?.trim()
  if (addressLine2) {
    return trimLeadingSegment(addressLine2, streetAddress)
  }

  const formatted = result.formatted.trim()
  if (!formatted) return ''

  const parts = formatted
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return ''
  if (parts[0] === primaryLabel && parts.length > 1) return parts.slice(1).join(', ')

  return parts.slice(1).join(', ')
}

function inferFeatureType(result: GeoapifyAutocompleteResult): string {
  const resultType = (result.result_type ?? '').toLowerCase()
  const category = (result.category ?? result.datasource?.raw?.category ?? '').toLowerCase()
  const hasStreetAddress = Boolean(result.housenumber || result.street)

  if (
    resultType === 'amenity'
    || category.startsWith('accommodation')
    || category.startsWith('activity')
    || category.startsWith('catering')
    || category.startsWith('commercial')
    || category.startsWith('education')
    || category.startsWith('entertainment')
    || category.startsWith('leisure')
    || category.startsWith('office')
    || category.startsWith('service')
    || category.startsWith('sport')
    || category.startsWith('tourism')
  ) {
    return 'poi'
  }

  if (resultType === 'street' || resultType === 'building' || hasStreetAddress) {
    return 'address'
  }

  if (resultType === 'suburb' || resultType === 'quarter' || resultType === 'neighbourhood' || resultType === 'neighborhood') {
    return 'neighborhood'
  }

  if (
    resultType === 'city'
    || resultType === 'town'
    || resultType === 'village'
    || resultType === 'municipality'
    || resultType === 'hamlet'
  ) {
    return 'locality'
  }

  if (resultType === 'county' || resultType === 'district') {
    return 'district'
  }

  if (resultType === 'state' || resultType === 'region') {
    return 'region'
  }

  if (resultType === 'country') {
    return 'country'
  }

  return resultType || category || result.datasource?.raw?.type || 'other'
}

export function toSearchSuggestion(result: GeoapifyAutocompleteResult): SearchSuggestion {
  const streetAddress = buildStreetAddress(result)
  const fallbackLabel = result.formatted.split(',')[0]?.trim() ?? result.formatted.trim()
  const featureType = inferFeatureType(result)
  const name = firstDefined([
    result.name,
    result.datasource?.raw?.name,
    featureType === 'poi' ? '' : streetAddress,
    result.address_line1,
    fallbackLabel,
  ])
  const address = firstDefined([
    streetAddress,
    result.address_line1 && result.address_line1.trim() !== name ? result.address_line1 : '',
    featureType === 'poi' ? '' : fallbackLabel,
  ])
  const fullAddress = result.formatted.trim()
  const placeFormatted = buildPlaceFormatted(
    result,
    firstDefined([result.address_line1, name, fallbackLabel]),
    streetAddress
  )
  const placeId = String(
    result.place_id
      ?? result.datasource?.raw?.place_id
      ?? result.datasource?.raw?.osm_id
      ?? fullAddress
  )

  return {
    id: [
      result.datasource?.raw?.osm_type ?? result.result_type ?? 'place',
      result.datasource?.raw?.osm_id ?? placeId,
      result.category ?? result.datasource?.raw?.type ?? result.result_type ?? 'result',
    ].join(':'),
    placeId,
    osmType: result.datasource?.raw?.osm_type,
    osmId: result.datasource?.raw?.osm_id != null ? String(result.datasource.raw.osm_id) : undefined,
    name,
    namePreferred: name,
    featureType,
    address,
    fullAddress,
    placeFormatted,
    context: {
      country: result.country || result.country_code
        ? {
            name: result.country,
            country_code: result.country_code?.toUpperCase(),
          }
        : undefined,
      region: result.state || result.state_code
        ? {
            name: result.state,
            region_code: result.state_code,
          }
        : undefined,
      place: firstDefined([result.city, result.town, result.village, result.municipality, result.hamlet])
        ? {
            name: firstDefined([result.city, result.town, result.village, result.municipality, result.hamlet]),
          }
        : undefined,
      locality: result.suburb
        ? {
            name: result.suburb,
          }
        : undefined,
      district: firstDefined([result.county, result.district])
        ? {
            name: firstDefined([result.county, result.district]),
          }
        : undefined,
      neighborhood: firstDefined([result.neighbourhood, result.neighborhood])
        ? {
            name: firstDefined([result.neighbourhood, result.neighborhood]),
          }
        : undefined,
      postcode: result.postcode
        ? {
            name: result.postcode,
          }
        : undefined,
    },
    lat: Number(result.lat),
    lng: Number(result.lon),
    category: result.category ?? result.datasource?.raw?.category ?? '',
    type: result.result_type ?? result.datasource?.raw?.type ?? '',
    importance: result.rank?.importance ?? result.rank?.popularity ?? 0,
    placeRank: result.rank?.confidence ?? null,
  }
}
