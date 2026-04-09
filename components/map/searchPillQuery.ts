import type { SearchBoxSuggestion } from '@mapbox/search-js-core'

const STREET_TYPE_TOKENS = new Set([
  'st',
  'street',
  'ave',
  'av',
  'avenue',
  'blvd',
  'boulevard',
  'rd',
  'road',
  'dr',
  'drive',
  'ln',
  'lane',
  'ct',
  'court',
  'pl',
  'place',
  'ter',
  'terrace',
  'hwy',
  'highway',
  'pkwy',
  'parkway',
  'sq',
  'square',
])

function tokenizeQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

function isHouseNumberToken(token: string): boolean {
  return /^\d+[a-zA-Z]?$/.test(token)
}

function normalizeToken(token: string): string {
  return token
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function buildAddressFallbackQuery(query: string): string | null {
  const tokens = tokenizeQuery(query)
  const numberIndex = tokens.findIndex(isHouseNumberToken)

  if (numberIndex < 0) return null

  if (numberIndex > 0) {
    const fallback = [...tokens.slice(0, numberIndex), ...tokens.slice(numberIndex + 1)].join(' ').trim()
    return fallback && fallback !== query.trim() ? fallback : null
  }

  const streetTypeIndex = tokens.findIndex((token, index) => {
    return index > 0 && STREET_TYPE_TOKENS.has(normalizeToken(token))
  })

  if (streetTypeIndex <= 0 || streetTypeIndex >= tokens.length - 1) return null

  const fallback = tokens.slice(1).join(' ').trim()
  return fallback && fallback !== query.trim() ? fallback : null
}

export function mergeSuggestions(
  primary: SearchBoxSuggestion[],
  secondary: SearchBoxSuggestion[],
  limit: number
): SearchBoxSuggestion[] {
  const merged: SearchBoxSuggestion[] = []
  const seen = new Set<string>()

  for (const suggestion of [...primary, ...secondary]) {
    if (seen.has(suggestion.mapbox_id)) continue
    seen.add(suggestion.mapbox_id)
    merged.push(suggestion)
    if (merged.length >= limit) break
  }

  return merged
}
