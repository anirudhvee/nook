import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { findStreetTypeIndex } from './searchPillTokens'

function tokenizeQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

function isHouseNumberToken(token: string): boolean {
  return /^\d+[a-zA-Z]?$/.test(token)
}

export function buildAddressFallbackQuery(query: string): string | null {
  const tokens = tokenizeQuery(query)
  const numberIndex = tokens.findIndex(isHouseNumberToken)

  if (numberIndex < 0) return null

  const streetTypeIndex = findStreetTypeIndex(tokens, numberIndex + 1)

  if (numberIndex > 0) {
    if (streetTypeIndex < 0) return null

    const fallback = [...tokens.slice(0, numberIndex), ...tokens.slice(numberIndex + 1)].join(' ').trim()
    return fallback && fallback !== query.trim() ? fallback : null
  }

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
