import { normalizeSearchText } from '@/components/map/searchPillMatch'
import type { SearchSuggestion } from '@/components/map/searchTypes'

function readSuggestionText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getSuggestionSubtitle(suggestion: SearchSuggestion): string | null {
  const name = readSuggestionText(suggestion.name)
  const preferredName = readSuggestionText(suggestion.namePreferred)
  const address = readSuggestionText(suggestion.address)
  const fullAddress = readSuggestionText(suggestion.fullAddress)
  const placeFormatted = readSuggestionText(suggestion.placeFormatted)

  const normalizedNames = new Set(
    [name, preferredName]
      .map(value => normalizeSearchText(value))
      .filter(Boolean)
  )

  if (address && placeFormatted) {
    return normalizedNames.has(normalizeSearchText(address))
      ? placeFormatted
      : `${address}, ${placeFormatted}`
  }

  if (fullAddress && !normalizedNames.has(normalizeSearchText(fullAddress))) {
    return fullAddress
  }

  if (placeFormatted && !normalizedNames.has(normalizeSearchText(placeFormatted))) {
    return placeFormatted
  }

  if (address && !normalizedNames.has(normalizeSearchText(address))) {
    return address
  }

  return null
}
