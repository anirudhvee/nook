import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { getSuggestionSubtitle } from '../../../../components/map/searchPillSuggestionText'

function makeSuggestion(overrides: Partial<SearchBoxSuggestion>): SearchBoxSuggestion {
  return {
    name: '',
    name_preferred: '',
    mapbox_id: 'test-id',
    feature_type: 'address',
    address: '',
    full_address: '',
    place_formatted: '',
    context: {} as SearchBoxSuggestion['context'],
    language: 'en',
    maki: 'marker',
    poi_category: [],
    brand: '',
    brand_id: '',
    external_ids: {},
    metadata: {},
    distance: 0,
    eta: 0,
    added_distance: 0,
    added_time: 0,
    ...overrides,
  }
}

test('getSuggestionSubtitle includes street address for chain POIs', () => {
  const suggestion = makeSuggestion({
    name: 'Starbucks',
    feature_type: 'poi',
    address: '150 Van Ness Avenue',
    place_formatted: 'San Francisco, California 94102, United States',
    full_address: '150 Van Ness Avenue, San Francisco, California 94102, United States',
  })

  assert.equal(
    getSuggestionSubtitle(suggestion),
    '150 Van Ness Avenue, San Francisco, California 94102, United States'
  )
})

test('getSuggestionSubtitle avoids repeating the street for address results', () => {
  const suggestion = makeSuggestion({
    name: '150 Van Ness Avenue',
    feature_type: 'address',
    address: '150 Van Ness Avenue',
    place_formatted: 'San Francisco, California 94102, United States',
    full_address: '150 Van Ness Avenue, San Francisco, California 94102, United States',
  })

  assert.equal(getSuggestionSubtitle(suggestion), 'San Francisco, California 94102, United States')
})

test('getSuggestionSubtitle falls back to place context when there is no street address', () => {
  const suggestion = makeSuggestion({
    name: 'Mission District',
    feature_type: 'neighborhood',
    place_formatted: 'San Francisco, California, United States',
    full_address: '',
  })

  assert.equal(getSuggestionSubtitle(suggestion), 'San Francisco, California, United States')
})

test('getSuggestionSubtitle returns null when no distinct subtitle is available', () => {
  const suggestion = makeSuggestion({
    name: 'California',
    feature_type: 'region',
    place_formatted: 'California',
    full_address: '',
  })

  assert.equal(getSuggestionSubtitle(suggestion), null)
})
