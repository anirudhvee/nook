import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { normalizeSearchText } from './searchPillMatch'
import { findStreetTypeIndex } from './searchPillTokens'

export type SuggestionFallback = {
  addressTokens: string[]
  promotionTokens: string[]
  query: string
}

type AddressSegment = {
  houseNumberIndex: number
  streetTypeIndex: number
}

const AMBIGUOUS_STREET_NAME_TOKENS = new Set(['st', 'ave', 'av'])

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

function looksLikeStreetNameAbbreviation(tokens: string[], streetTypeIndex: number): boolean {
  const token = (tokens[streetTypeIndex] ?? '').toLowerCase()
  if (!AMBIGUOUS_STREET_NAME_TOKENS.has(token)) return false

  return findStreetTypeIndex(tokens, streetTypeIndex + 1) >= 0
}

function findAddressSegment(tokens: string[]): AddressSegment | null {
  const searchStartIndex = 0

  while (searchStartIndex < tokens.length) {
    let streetTypeIndex = findStreetTypeIndex(tokens, searchStartIndex)
    if (streetTypeIndex < 0) return null

    while (streetTypeIndex >= 0) {
      let shouldContinue = false

      for (let tokenIndex = streetTypeIndex - 1; tokenIndex >= searchStartIndex; tokenIndex -= 1) {
        if (isHouseNumberToken(tokens[tokenIndex] ?? '')) {
          if (looksLikeStreetNameAbbreviation(tokens, streetTypeIndex)) {
            shouldContinue = true
            break
          }

          return {
            houseNumberIndex: tokenIndex,
            streetTypeIndex,
          }
        }
      }

      if (shouldContinue) {
        streetTypeIndex = findStreetTypeIndex(tokens, streetTypeIndex + 1)
        continue
      }

      streetTypeIndex = findStreetTypeIndex(tokens, streetTypeIndex + 1)
    }

    return null
  }

  return null
}

function isAmbiguousLeadingAddressSegment(
  tokens: string[],
  houseNumberIndex: number,
  streetTypeIndex: number
): boolean {
  if (houseNumberIndex !== 0) return false

  const houseNumber = tokens[houseNumberIndex] ?? ''
  if (!/^\d{1,2}[a-zA-Z]?$/.test(houseNumber)) return false

  const streetNameTokens = tokens.slice(houseNumberIndex + 1, streetTypeIndex)
  const suffixTokens = tokens.slice(streetTypeIndex + 1)

  return streetNameTokens.length >= 2 && suffixTokens.length >= 2
}

function buildSuggestionFallbackResult(
  query: string,
  fallback: string,
  addressTokens: string[],
  promotionTokens: string[]
): SuggestionFallback | null {
  const trimmedQuery = query.trim()
  if (!fallback || fallback === trimmedQuery) return null

  return {
    addressTokens: normalizeTokens(addressTokens),
    promotionTokens: normalizeTokens(promotionTokens),
    query: fallback,
  }
}

export function buildAddressFallbackQuery(query: string): string | null {
  return buildAddressFallback(query)?.query ?? null
}

function buildAddressFallback(query: string): SuggestionFallback | null {
  const tokens = tokenizeQuery(query)
  const addressSegment = findAddressSegment(tokens)
  if (!addressSegment) return null

  const { houseNumberIndex: numberIndex, streetTypeIndex } = addressSegment
  if (isAmbiguousLeadingAddressSegment(tokens, numberIndex, streetTypeIndex)) return null

  if (numberIndex > 0) {
    if (streetTypeIndex < 0) return null

    const fallback = [...tokens.slice(0, numberIndex), ...tokens.slice(numberIndex + 1)].join(' ').trim()
    return buildSuggestionFallbackResult(
      query,
      fallback,
      tokens.slice(numberIndex, streetTypeIndex + 1),
      tokens.slice(0, numberIndex)
    )
  }

  if (streetTypeIndex <= 0 || streetTypeIndex >= tokens.length - 1) return null

  const fallback = tokens.slice(1).join(' ').trim()
  return buildSuggestionFallbackResult(
    query,
    fallback,
    tokens.slice(numberIndex, streetTypeIndex + 1),
    tokens.slice(streetTypeIndex + 1)
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
    tokens.slice(numberIndex),
    tokens.slice(0, numberIndex)
  )
}

export function buildSuggestionFallback(query: string): SuggestionFallback | null {
  return buildAddressFallback(query) ?? buildPartialAddressFallback(query)
}

export async function resolvePrimaryThenOptionalFallback<T>(
  primaryPromise: Promise<T>,
  fallbackPromise: Promise<T> | null | undefined,
  onPrimary: (primary: T) => void
): Promise<[T, T | null]> {
  const handledFallbackPromise = fallbackPromise
    ? fallbackPromise.catch(() => null)
    : null
  const primary = await primaryPromise
  onPrimary(primary)
  const fallback = handledFallbackPromise ? await handledFallbackPromise : null

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

function getSuggestionNameCandidates(suggestion: SearchBoxSuggestion): string[] {
  return [
    typeof suggestion.name === 'string' ? suggestion.name : '',
    typeof suggestion.name_preferred === 'string' ? suggestion.name_preferred : '',
    typeof suggestion.brand === 'string' ? suggestion.brand : '',
  ].filter(Boolean)
}

function matchesAddressToken(queryToken: string, candidateToken: string, index: number): boolean {
  if (!candidateToken) return false

  if (index === 0 && isHouseNumberToken(queryToken)) {
    return candidateToken === queryToken
  }

  return candidateToken.startsWith(queryToken)
}

function matchesAddressTokens(suggestion: SearchBoxSuggestion, addressTokens: string[]): boolean {
  if (suggestion.feature_type !== 'poi' || addressTokens.length === 0) return false

  return getSuggestionAddressCandidates(suggestion).some(candidate => {
    const candidateTokens = normalizeSearchText(candidate).split(' ').filter(Boolean)
    if (candidateTokens.length < addressTokens.length) return false

    return addressTokens.every((token, index) => {
      return matchesAddressToken(token, candidateTokens[index] ?? '', index)
    })
  })
}

function matchesPromotionTokens(suggestion: SearchBoxSuggestion, promotionTokens: string[]): boolean {
  if (promotionTokens.length === 0) return true

  return getSuggestionNameCandidates(suggestion).some(candidate => {
    const candidateTokens = normalizeSearchText(candidate).split(' ').filter(Boolean)
    if (candidateTokens.length < promotionTokens.length) return false

    return promotionTokens.every((token, index) => {
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
    return (
      matchesAddressTokens(suggestion, fallback.addressTokens)
      && matchesPromotionTokens(suggestion, fallback.promotionTokens)
    )
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
