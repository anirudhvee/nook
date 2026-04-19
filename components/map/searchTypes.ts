export type NominatimAddress = Record<string, string | undefined>

export type NominatimContext = {
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

export type NominatimSearchResult = {
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
  context: NominatimContext
  lat: number
  lng: number
  category: string
  type: string
  importance: number
  placeRank: number | null
}

export type NominatimApiResult = {
  place_id: number | string
  osm_type?: string
  osm_id?: number | string
  lat: string
  lon: string
  display_name: string
  category?: string
  type: string
  addresstype?: string
  importance?: number
  place_rank?: number
  address?: NominatimAddress
  name?: string
}

function firstDefined(values: Array<string | undefined>): string {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function buildAddressLabel(address: NominatimAddress, fallback: string): string {
  const houseNumber = address.house_number?.trim()
  const road = firstDefined([
    address.road,
    address.pedestrian,
    address.footway,
    address.cycleway,
    address.path,
    address.highway,
  ])

  if (houseNumber && road) return `${houseNumber} ${road}`
  if (road) return road

  return firstDefined([
    address.amenity,
    address.shop,
    address.tourism,
    address.leisure,
    address.office,
    address.building,
    address.hamlet,
    address.neighbourhood,
    address.neighborhood,
    address.suburb,
    address.city_district,
    address.city,
    address.town,
    address.village,
    fallback,
  ])
}

function inferFeatureType(result: NominatimApiResult, address: NominatimAddress): string {
  const addresstype = result.addresstype ?? ''
  const category = result.category ?? ''

  if (
    category === 'amenity'
    || category === 'shop'
    || category === 'tourism'
    || category === 'leisure'
    || category === 'office'
  ) {
    return 'poi'
  }

  if (addresstype === 'house' || addresstype === 'building' || address.road || address.house_number) {
    return 'address'
  }

  if (addresstype === 'neighbourhood' || addresstype === 'neighborhood' || addresstype === 'suburb') {
    return 'neighborhood'
  }

  if (addresstype === 'city' || addresstype === 'town' || addresstype === 'village' || addresstype === 'municipality') {
    return 'locality'
  }

  if (addresstype === 'county' || addresstype === 'district') {
    return 'district'
  }

  if (addresstype === 'state' || addresstype === 'region') {
    return 'region'
  }

  if (addresstype === 'country') {
    return 'country'
  }

  return addresstype || category || result.type || 'other'
}

function buildPlaceFormatted(displayName: string): string {
  const parts = displayName
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  return parts.slice(1).join(', ')
}

export function toNominatimSearchResult(result: NominatimApiResult): NominatimSearchResult {
  const address = result.address ?? {}
  const displayName = result.display_name.trim()
  const fallbackName = displayName.split(',')[0]?.trim() ?? displayName
  const name = firstDefined([
    result.name,
    address.amenity,
    address.shop,
    address.tourism,
    address.leisure,
    buildAddressLabel(address, fallbackName),
    fallbackName,
  ])
  const addressLabel = buildAddressLabel(address, fallbackName)
  const countryCode = address.country_code?.toUpperCase()

  return {
    id: [result.osm_type ?? 'place', result.osm_id ?? result.place_id, result.category ?? result.type].join(':'),
    placeId: String(result.place_id),
    osmType: result.osm_type,
    osmId: result.osm_id != null ? String(result.osm_id) : undefined,
    name,
    namePreferred: name,
    featureType: inferFeatureType(result, address),
    address: addressLabel,
    fullAddress: displayName,
    placeFormatted: buildPlaceFormatted(displayName),
    context: {
      country: address.country || countryCode
        ? {
            name: address.country,
            country_code: countryCode,
          }
        : undefined,
      region: address.state || address.region || address.state_district
        ? {
            name: firstDefined([address.state, address.region, address.state_district]),
          }
        : undefined,
      place: firstDefined([address.city, address.town, address.village, address.municipality])
        ? {
            name: firstDefined([address.city, address.town, address.village, address.municipality]),
          }
        : undefined,
      locality: firstDefined([address.suburb, address.quarter, address.borough])
        ? {
            name: firstDefined([address.suburb, address.quarter, address.borough]),
          }
        : undefined,
      district: firstDefined([address.county, address.city_district, address.state_district, address.district])
        ? {
            name: firstDefined([address.county, address.city_district, address.state_district, address.district]),
          }
        : undefined,
      neighborhood: firstDefined([address.neighbourhood, address.neighborhood, address.hamlet])
        ? {
            name: firstDefined([address.neighbourhood, address.neighborhood, address.hamlet]),
          }
        : undefined,
      postcode: address.postcode
        ? {
            name: address.postcode,
          }
        : undefined,
    },
    lat: Number(result.lat),
    lng: Number(result.lon),
    category: result.category ?? '',
    type: result.type,
    importance: result.importance ?? 0,
    placeRank: result.place_rank ?? null,
  }
}
