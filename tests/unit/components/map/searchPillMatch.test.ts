import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { findDirectMatchSuggestion, normalizeSearchText } from '../../../../components/map/searchPillMatch'

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

test('normalizeSearchText expands common address abbreviations', () => {
  assert.equal(normalizeSearchText('415 Mission St.'), '415 mission street')
  assert.equal(normalizeSearchText('500 N 2nd Ave'), '500 north 2nd avenue')
})

test('findDirectMatchSuggestion matches exact addresses after normalization', () => {
  const suggestion = makeSuggestion({
    mapbox_id: '415-mission',
    address: '415 Mission Street',
    full_address: '415 Mission Street, San Francisco, California 94105, United States',
    place_formatted: 'San Francisco, California 94105, United States',
  })

  const match = findDirectMatchSuggestion('415 mission st', [suggestion])
  assert.equal(match?.mapbox_id, '415-mission')
})

test('findDirectMatchSuggestion does not treat partial addresses as exact matches', () => {
  const suggestion = makeSuggestion({
    mapbox_id: '415-mission',
    address: '415 Mission Street',
    full_address: '415 Mission Street, San Francisco, California 94105, United States',
  })

  const match = findDirectMatchSuggestion('415 mission', [suggestion])
  assert.equal(match, null)
})

test('findDirectMatchSuggestion ignores non-retrievable suggestions', () => {
  const suggestion = makeSuggestion({
    mapbox_id: '415-mission',
    address: '415 Mission Street',
    full_address: '415 Mission Street, San Francisco, California 94105, United States',
  })

  const match = findDirectMatchSuggestion('415 mission st', [suggestion], () => false)
  assert.equal(match, null)
})

test('findDirectMatchSuggestion tolerates suggestions without full_address', () => {
  const suggestion = makeSuggestion({
    mapbox_id: 'mission-district',
    name: 'Mission District',
    full_address: undefined as unknown as string,
    place_formatted: 'San Francisco, California, United States',
  })

  const match = findDirectMatchSuggestion('mission district', [suggestion])
  assert.equal(match?.mapbox_id, 'mission-district')
})

test('findDirectMatchSuggestion supports address plus country code context', () => {
  const suggestion = makeSuggestion({
    mapbox_id: '58-marine-terrace-sg',
    name: '58 Marine Terrace',
    address: '58 Marine Terrace',
    full_address: '58 Marine Terrace, Marine Parade, Singapore 440058',
    place_formatted: 'Marine Parade, Singapore 440058',
    context: {
      country: {
        id: 'country.sg',
        name: 'Singapore',
        country_code: 'SG',
        country_code_alpha_3: 'SGP',
      },
      place: {
        id: 'place.marine-parade',
        name: 'Marine Parade',
      },
    },
  })

  const match = findDirectMatchSuggestion('58 marine terrace sg', [suggestion])
  assert.equal(match?.mapbox_id, '58-marine-terrace-sg')
})
