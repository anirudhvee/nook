import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchBoxSuggestion } from '@mapbox/search-js-core'
import { buildAddressFallbackQuery, mergeSuggestions } from '../../../../components/map/searchPillQuery'

function makeSuggestion(mapboxId: string): SearchBoxSuggestion {
  return {
    name: mapboxId,
    name_preferred: mapboxId,
    mapbox_id: mapboxId,
    feature_type: 'poi',
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
  }
}

test('buildAddressFallbackQuery removes a house number from brand-first queries', () => {
  assert.equal(
    buildAddressFallbackQuery('starbucks 150 van ness avenue'),
    'starbucks van ness avenue'
  )
})

test('buildAddressFallbackQuery removes a leading house number when extra query text follows the address', () => {
  assert.equal(
    buildAddressFallbackQuery('150 van ness avenue starbucks'),
    'van ness avenue starbucks'
  )
})

test('buildAddressFallbackQuery skips pure address queries', () => {
  assert.equal(buildAddressFallbackQuery('150 van ness avenue'), null)
})

test('buildAddressFallbackQuery skips queries without a plain house number', () => {
  assert.equal(buildAddressFallbackQuery('starbucks 24th street'), null)
})

test('buildAddressFallbackQuery skips venue names that only contain a number', () => {
  assert.equal(buildAddressFallbackQuery('cafe 86'), null)
  assert.equal(buildAddressFallbackQuery('studio 54 coffee'), null)
})

test('mergeSuggestions de-duplicates while preserving order', () => {
  const merged = mergeSuggestions(
    [makeSuggestion('a'), makeSuggestion('b')],
    [makeSuggestion('b'), makeSuggestion('c')],
    5
  )

  assert.deepEqual(merged.map(suggestion => suggestion.mapbox_id), ['a', 'b', 'c'])
})

test('mergeSuggestions respects the result limit', () => {
  const merged = mergeSuggestions(
    [makeSuggestion('a'), makeSuggestion('b'), makeSuggestion('c')],
    [makeSuggestion('d')],
    2
  )

  assert.deepEqual(merged.map(suggestion => suggestion.mapbox_id), ['a', 'b'])
})
