import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchSuggestion } from '../../../../components/map/searchTypes'
import { getSuggestionSubtitle } from '../../../../components/map/searchPillSuggestionText'

function makeSuggestion(overrides: Partial<SearchSuggestion>): SearchSuggestion {
  return {
    name: '',
    namePreferred: '',
    id: 'test-id',
    placeId: 'test-place',
    featureType: 'address',
    address: '',
    fullAddress: '',
    placeFormatted: '',
    context: {},
    lat: 0,
    lng: 0,
    category: '',
    type: '',
    importance: 0,
    placeRank: null,
    ...overrides,
  }
}

test('getSuggestionSubtitle includes street address for chain POIs', () => {
  const suggestion = makeSuggestion({
    name: 'Starbucks',
    featureType: 'poi',
    address: '150 Van Ness Avenue',
    placeFormatted: 'San Francisco, California 94102, United States',
    fullAddress: '150 Van Ness Avenue, San Francisco, California 94102, United States',
  })

  assert.equal(
    getSuggestionSubtitle(suggestion),
    '150 Van Ness Avenue, San Francisco, California 94102, United States'
  )
})

test('getSuggestionSubtitle avoids repeating the street for address results', () => {
  const suggestion = makeSuggestion({
    name: '150 Van Ness Avenue',
    featureType: 'address',
    address: '150 Van Ness Avenue',
    placeFormatted: 'San Francisco, California 94102, United States',
    fullAddress: '150 Van Ness Avenue, San Francisco, California 94102, United States',
  })

  assert.equal(getSuggestionSubtitle(suggestion), 'San Francisco, California 94102, United States')
})

test('getSuggestionSubtitle falls back to place context when there is no street address', () => {
  const suggestion = makeSuggestion({
    name: 'Mission District',
    featureType: 'neighborhood',
    placeFormatted: 'San Francisco, California, United States',
    fullAddress: '',
  })

  assert.equal(getSuggestionSubtitle(suggestion), 'San Francisco, California, United States')
})

test('getSuggestionSubtitle returns null when no distinct subtitle is available', () => {
  const suggestion = makeSuggestion({
    name: 'California',
    featureType: 'region',
    placeFormatted: 'California',
    fullAddress: '',
  })

  assert.equal(getSuggestionSubtitle(suggestion), null)
})
