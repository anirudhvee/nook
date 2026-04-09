import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { findStreetTypeIndex } from './searchPillTokens'

function tokenizeQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

function isHouseNumberToken(token: string): boolean {
  return /^\d+[a-zA-Z]?$/.test(token)
}

function findAddressHouseNumberIndex(tokens: string[]): number {
  let searchStartIndex = 0

  while (searchStartIndex < tokens.length) {
    const streetTypeIndex = findStreetTypeIndex(tokens, searchStartIndex)
    if (streetTypeIndex < 0) return -1

    for (let tokenIndex = streetTypeIndex - 1; tokenIndex >= 0; tokenIndex -= 1) {
      if (isHouseNumberToken(tokens[tokenIndex] ?? '')) return tokenIndex
    }

    searchStartIndex = streetTypeIndex + 1
  }

  return -1
}

export function buildAddressFallbackQuery(query: string): string | null {
  const tokens = tokenizeQuery(query)
  const numberIndex = findAddressHouseNumberIndex(tokens)

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

export async function resolvePrimaryWithOptionalFallback<T>(
  primaryPromise: Promise<T>,
  fallbackPromise?: Promise<T> | null
): Promise<[T, T | null]> {
  const handledFallbackPromise = fallbackPromise
    ? fallbackPromise.catch(() => null)
    : Promise.resolve(null)

  const [primary, fallback] = await Promise.all([primaryPromise, handledFallbackPromise])

  return [primary, fallback]
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
