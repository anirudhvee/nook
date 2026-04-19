import { normalizeSearchText } from '@/components/map/searchPillMatch'
import { findStreetTypeIndex } from '@/components/map/searchPillTokens'
import type { SearchSuggestion } from '@/components/map/searchTypes'

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

  if (searchStartIndex >= tokens.length) return null

  let streetTypeIndex = findStreetTypeIndex(tokens, searchStartIndex)
  if (streetTypeIndex < 0) return null

  while (streetTypeIndex >= 0) {
    for (let tokenIndex = streetTypeIndex - 1; tokenIndex >= searchStartIndex; tokenIndex -= 1) {
      if (isHouseNumberToken(tokens[tokenIndex] ?? '')) {
        if (looksLikeStreetNameAbbreviation(tokens, streetTypeIndex)) {
          break
        }

        return {
          houseNumberIndex: tokenIndex,
          streetTypeIndex,
        }
      }
    }

    streetTypeIndex = findStreetTypeIndex(tokens, streetTypeIndex + 1)
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

function getSuggestionAddressCandidates(suggestion: SearchSuggestion): string[] {
  const fullAddress = typeof suggestion.fullAddress === 'string' ? suggestion.fullAddress : ''
  const primaryAddress = fullAddress.split(',')[0] ?? ''

  return [
    typeof suggestion.address === 'string' ? suggestion.address : '',
    primaryAddress,
  ].filter(Boolean)
}

function getSuggestionNameCandidates(suggestion: SearchSuggestion): string[] {
  return [
    typeof suggestion.name === 'string' ? suggestion.name : '',
    typeof suggestion.namePreferred === 'string' ? suggestion.namePreferred : '',
  ].filter(Boolean)
}

function matchesAddressToken(queryToken: string, candidateToken: string, index: number): boolean {
  if (!candidateToken) return false

  if (index === 0 && isHouseNumberToken(queryToken)) {
    return candidateToken === queryToken
  }

  return candidateToken.startsWith(queryToken)
}

function matchesAddressTokens(suggestion: SearchSuggestion, addressTokens: string[]): boolean {
  if (suggestion.featureType !== 'poi' || addressTokens.length === 0) return false

  return getSuggestionAddressCandidates(suggestion).some(candidate => {
    const candidateTokens = normalizeSearchText(candidate).split(' ').filter(Boolean)
    if (candidateTokens.length < addressTokens.length) return false

    return addressTokens.every((token, index) => {
      return matchesAddressToken(token, candidateTokens[index] ?? '', index)
    })
  })
}

function matchesPromotionTokens(suggestion: SearchSuggestion, promotionTokens: string[]): boolean {
  if (promotionTokens.length === 0) return true

  return getSuggestionNameCandidates(suggestion).some(candidate => {
    const candidateTokens = normalizeSearchText(candidate).split(' ').filter(Boolean)
    const comparableLength = Math.min(candidateTokens.length, promotionTokens.length)
    if (comparableLength === 0) return false

    const sharedPrefixMatches = Array.from({ length: comparableLength }).every((_, index) => {
      return candidateTokens[index]?.startsWith(promotionTokens[index] ?? '')
    })
    if (!sharedPrefixMatches) return false

    return (
      candidateTokens.length >= promotionTokens.length
      || candidateTokens.every((token, index) => token.startsWith(promotionTokens[index] ?? ''))
    )
  })
}

function combineSuggestions(groups: SearchSuggestion[][], limit: number): SearchSuggestion[] {
  const merged: SearchSuggestion[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const suggestion of group) {
      if (seen.has(suggestion.id)) continue
      seen.add(suggestion.id)
      merged.push(suggestion)
      if (merged.length >= limit) return merged
    }
  }

  return merged
}

export function mergeSuggestionResults(
  primary: SearchSuggestion[],
  secondary: SearchSuggestion[],
  fallback: SuggestionFallback,
  limit: number
): SearchSuggestion[] {
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
  primary: SearchSuggestion[],
  secondary: SearchSuggestion[],
  limit: number
): SearchSuggestion[] {
  return combineSuggestions([primary, secondary], limit)
}
