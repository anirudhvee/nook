const NOOK_PATH_PREFIX = '/nook/'
const SEARCH_QUERY_PARAM = 'q'
const SEARCH_LAT_PARAM = 'lat'
const SEARCH_LNG_PARAM = 'lng'

type SearchParamsLike = {
  get(name: string): string | null
}

export type NookSearchContext = {
  lng: number
  lat: number
  name: string
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
}

function getSearchContextQuery(searchContext: NookSearchContext | null | undefined): string {
  if (!searchContext || !searchContext.name.trim()) return ''

  const params = new URLSearchParams()
  params.set(SEARCH_QUERY_PARAM, searchContext.name)
  params.set(SEARCH_LAT_PARAM, String(searchContext.lat))
  params.set(SEARCH_LNG_PARAM, String(searchContext.lng))
  return params.toString()
}

export function getDiscoveryUrl(searchContext?: NookSearchContext | null): string {
  const query = getSearchContextQuery(searchContext)
  return query ? `/?${query}` : '/'
}

export function getNookUrl(slug: string, searchContext?: NookSearchContext | null): string {
  const path = `${NOOK_PATH_PREFIX}${encodeURIComponent(slug)}`
  const query = getSearchContextQuery(searchContext)
  return query ? `${path}?${query}` : path
}

export function getSelectedNookSlugFromUrl(pathname: string): string | null {
  if (pathname.startsWith(NOOK_PATH_PREFIX)) {
    const encodedSlug = pathname.slice(NOOK_PATH_PREFIX.length).split('/')[0]
    if (!encodedSlug) return null

    try {
      return decodeURIComponent(encodedSlug)
    } catch {
      return encodedSlug
    }
  }

  return null
}

export function getSearchContextFromParams(params: SearchParamsLike): NookSearchContext | null {
  const name = params.get(SEARCH_QUERY_PARAM)?.trim()
  if (!name) return null

  const latParam = params.get(SEARCH_LAT_PARAM)?.trim()
  const lngParam = params.get(SEARCH_LNG_PARAM)?.trim()
  if (!latParam || !lngParam) return null

  const lat = Number(latParam)
  const lng = Number(lngParam)
  if (!isValidCoordinate(lat, lng)) return null

  return { name, lat, lng }
}
