import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { normalizeSearchText } from './searchPillMatch'
import { findStreetTypeIndex } from './searchPillTokens'

export type SuggestionFallback = {
  addressTokens: string[]
  query: string
}

function tokenizeQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

function isHouseNumberToken(token: string): boolean {
  return /^\d+[a-zA-Z]?$/.test(token)
}

function isFallbackHouseNumberToken(token: string): boolean {
  return /^\d{3,}[a-zA-Z]?$/.test(token)
}

function normalizeTokens(tokens: string[]): string[] {
  return normalizeSearchText(tokens.join(' ')).split(' ').filter(Boolean)
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

function buildSuggestionFallbackResult(
  query: string,
  fallback: string,
  addressTokens: string[]
): SuggestionFallback | null {
  const trimmedQuery = query.trim()
  if (!fallback || fallback === trimmedQuery) return null

  return {
    addressTokens: normalizeTokens(addressTokens),
    query: fallback,
  }
}

export function buildAddressFallbackQuery(query: string): string | null {
  return buildAddressFallback(query)?.query ?? null
}

function buildAddressFallback(query: string): SuggestionFallback | null {
  const tokens = tokenizeQuery(query)
  const numberIndex = findAddressHouseNumberIndex(tokens)

  if (numberIndex < 0) return null

  const streetTypeIndex = findStreetTypeIndex(tokens, numberIndex + 1)

  if (numberIndex > 0) {
    if (streetTypeIndex < 0) return null

    const fallback = [...tokens.slice(0, numberIndex), ...tokens.slice(numberIndex + 1)].join(' ').trim()
    return buildSuggestionFallbackResult(
      query,
      fallback,
      tokens.slice(numberIndex, streetTypeIndex + 1)
    )
  }

  if (streetTypeIndex <= 0 || streetTypeIndex >= tokens.length - 1) return null

  const fallback = tokens.slice(1).join(' ').trim()
  return buildSuggestionFallbackResult(
    query,
    fallback,
    tokens.slice(numberIndex, streetTypeIndex + 1)
  )
}

export function buildPartialAddressFallbackQuery(query: string): string | null {
  return buildPartialAddressFallback(query)?.query ?? null
}

function buildPartialAddressFallback(query: string): SuggestionFallback | null {
  const tokens = tokenizeQuery(query)
  const numberIndex = tokens.findIndex(isFallbackHouseNumberToken)

  if (numberIndex <= 0 || numberIndex >= tokens.length - 1) return null
  if (findStreetTypeIndex(tokens, numberIndex + 1) >= 0) return null

  const suffixTokens = tokens.slice(numberIndex + 1)
  if (!suffixTokens.some(token => /[a-zA-Z]/.test(token))) return null

  const fallback = [...tokens.slice(0, numberIndex), ...suffixTokens].join(' ').trim()

  return buildSuggestionFallbackResult(
    query,
    fallback,
    tokens.slice(numberIndex)
  )
}

export function buildSuggestionFallback(query: string): SuggestionFallback | null {
  return buildAddressFallback(query) ?? buildPartialAddressFallback(query)
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

function getSuggestionAddressCandidates(suggestion: SearchBoxSuggestion): string[] {
  const fullAddress = typeof suggestion.full_address === 'string' ? suggestion.full_address : ''
  const primaryAddress = fullAddress.split(',')[0] ?? ''

  return [
    typeof suggestion.address === 'string' ? suggestion.address : '',
    primaryAddress,
  ].filter(Boolean)
}

function matchesAddressTokens(suggestion: SearchBoxSuggestion, addressTokens: string[]): boolean {
  if (suggestion.feature_type !== 'poi' || addressTokens.length === 0) return false

  return getSuggestionAddressCandidates(suggestion).some(candidate => {
    const candidateTokens = normalizeSearchText(candidate).split(' ').filter(Boolean)
    if (candidateTokens.length < addressTokens.length) return false

    return addressTokens.every((token, index) => {
      return candidateTokens[index]?.startsWith(token)
    })
  })
}

function combineSuggestions(groups: SearchBoxSuggestion[][], limit: number): SearchBoxSuggestion[] {
  const merged: SearchBoxSuggestion[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const suggestion of group) {
      if (seen.has(suggestion.mapbox_id)) continue
      seen.add(suggestion.mapbox_id)
      merged.push(suggestion)
      if (merged.length >= limit) return merged
    }
  }

  return merged
}

export function mergeSuggestionResults(
  primary: SearchBoxSuggestion[],
  secondary: SearchBoxSuggestion[],
  fallback: SuggestionFallback,
  limit: number
): SearchBoxSuggestion[] {
  const promotedFallback = secondary.filter(suggestion => {
    return matchesAddressTokens(suggestion, fallback.addressTokens)
  })

  return combineSuggestions(
    promotedFallback.length > 0
      ? [promotedFallback, primary, secondary]
      : [primary, secondary],
    limit
  )
}

export function mergeSuggestions(
  primary: SearchBoxSuggestion[],
  secondary: SearchBoxSuggestion[],
  limit: number
): SearchBoxSuggestion[] {
  return combineSuggestions([primary, secondary], limit)
}
