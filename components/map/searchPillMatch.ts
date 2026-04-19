import type { NominatimSearchResult } from './searchTypes'
import { getCanonicalStreetType } from './searchPillTokens'

const DIRECTION_TOKENS: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
}

function normalizeToken(token: string): string {
  const direction = DIRECTION_TOKENS[token]
  if (direction) return direction

  const streetType = getCanonicalStreetType(token)
  if (streetType) return streetType

  return token
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken)
    .join(' ')
}

function readSuggestionText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getNormalizedTokens(value: string): string[] {
  return normalizeSearchText(value).split(' ').filter(Boolean)
}

function getSuggestionCandidates(suggestion: NominatimSearchResult): string[] {
  const fullAddress = readSuggestionText(suggestion.fullAddress)
  const primaryAddress = fullAddress.split(',')[0] ?? ''

  return [
    readSuggestionText(suggestion.address),
    primaryAddress,
    fullAddress,
    readSuggestionText(suggestion.name),
    readSuggestionText(suggestion.namePreferred),
    readSuggestionText(suggestion.placeFormatted),
  ].filter(Boolean)
}

function getAddressCandidates(suggestion: NominatimSearchResult): string[] {
  const fullAddress = readSuggestionText(suggestion.fullAddress)
  const primaryAddress = fullAddress.split(',')[0] ?? ''

  return [
    readSuggestionText(suggestion.address),
    primaryAddress,
    readSuggestionText(suggestion.namePreferred),
    readSuggestionText(suggestion.name),
  ].filter(Boolean)
}

function getSuggestionContextTerms(suggestion: NominatimSearchResult): string[] {
  const context = suggestion.context

  return [
    readSuggestionText(suggestion.placeFormatted),
    readSuggestionText(suggestion.fullAddress),
    readSuggestionText(context.country?.name),
    readSuggestionText(context.country?.country_code),
    readSuggestionText(context.country?.country_code_alpha_3),
    readSuggestionText(context.region?.name),
    readSuggestionText(context.region?.region_code),
    readSuggestionText(context.region?.region_code_full),
    readSuggestionText(context.place?.name),
    readSuggestionText(context.locality?.name),
    readSuggestionText(context.district?.name),
    readSuggestionText(context.neighborhood?.name),
    readSuggestionText(context.postcode?.name),
  ].filter(Boolean)
}

function isPrefixMatch(queryTokens: string[], candidateTokens: string[]): boolean {
  if (candidateTokens.length === 0 || queryTokens.length < candidateTokens.length) return false

  return candidateTokens.every((token, index) => queryTokens[index] === token)
}

function matchesContextTerms(extraTokens: string[], suggestion: NominatimSearchResult): boolean {
  if (extraTokens.length === 0) return true

  const contextTerms = getSuggestionContextTerms(suggestion)

  return extraTokens.every(token => {
    return contextTerms.some(term => {
      const normalizedTerm = normalizeSearchText(term)
      if (!normalizedTerm) return false

      return normalizedTerm === token || normalizedTerm.startsWith(token) || normalizedTerm.includes(` ${token}`)
    })
  })
}

export function isDirectMatch(query: string, suggestion: NominatimSearchResult): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false

  if (getSuggestionCandidates(suggestion).some(candidate => {
    return normalizeSearchText(candidate) === normalizedQuery
  })) {
    return true
  }

  const queryTokens = getNormalizedTokens(query)

  return getAddressCandidates(suggestion).some(candidate => {
    const candidateTokens = getNormalizedTokens(candidate)
    if (!isPrefixMatch(queryTokens, candidateTokens)) return false

    const extraTokens = queryTokens.slice(candidateTokens.length)
    return matchesContextTerms(extraTokens, suggestion)
  })
}

export function findDirectMatchSuggestion(
  query: string,
  suggestions: NominatimSearchResult[]
): NominatimSearchResult | null {
  return suggestions.find(suggestion => isDirectMatch(query, suggestion)) ?? null
}
