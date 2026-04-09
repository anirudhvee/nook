import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { normalizeSearchText } from './searchPillMatch'

function readSuggestionText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getSuggestionSubtitle(suggestion: SearchBoxSuggestion): string | null {
  const name = readSuggestionText(suggestion.name)
  const preferredName = readSuggestionText(suggestion.name_preferred)
  const address = readSuggestionText(suggestion.address)
  const fullAddress = readSuggestionText(suggestion.full_address)
  const placeFormatted = readSuggestionText(suggestion.place_formatted)

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
