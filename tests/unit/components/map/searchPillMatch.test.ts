import assert from 'node:assert/strict'
import test from 'node:test'
import type { NominatimSearchResult } from '../../../../components/map/searchTypes'
import { findDirectMatchSuggestion, normalizeSearchText } from '../../../../components/map/searchPillMatch'

function makeSuggestion(overrides: Partial<NominatimSearchResult>): NominatimSearchResult {
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

test('normalizeSearchText expands common address abbreviations', () => {
  assert.equal(normalizeSearchText('415 Mission St.'), '415 mission street')
  assert.equal(normalizeSearchText('500 N 2nd Ave'), '500 north 2nd avenue')
})

test('findDirectMatchSuggestion matches exact addresses after normalization', () => {
  const suggestion = makeSuggestion({
    id: '415-mission',
    address: '415 Mission Street',
    fullAddress: '415 Mission Street, San Francisco, California 94105, United States',
    placeFormatted: 'San Francisco, California 94105, United States',
  })

  const match = findDirectMatchSuggestion('415 mission st', [suggestion])
  assert.equal(match?.id, '415-mission')
})

test('findDirectMatchSuggestion does not treat partial addresses as exact matches', () => {
  const suggestion = makeSuggestion({
    id: '415-mission',
    address: '415 Mission Street',
    fullAddress: '415 Mission Street, San Francisco, California 94105, United States',
  })

  const match = findDirectMatchSuggestion('415 mission', [suggestion])
  assert.equal(match, null)
})

test('findDirectMatchSuggestion tolerates suggestions without full_address', () => {
  const suggestion = makeSuggestion({
    id: 'mission-district',
    name: 'Mission District',
    fullAddress: undefined as unknown as string,
    placeFormatted: 'San Francisco, California, United States',
  })

  const match = findDirectMatchSuggestion('mission district', [suggestion])
  assert.equal(match?.id, 'mission-district')
})

test('findDirectMatchSuggestion supports address plus country code context', () => {
  const suggestion = makeSuggestion({
    id: '58-marine-terrace-sg',
    name: '58 Marine Terrace',
    address: '58 Marine Terrace',
    fullAddress: '58 Marine Terrace, Marine Parade, Singapore 440058',
    placeFormatted: 'Marine Parade, Singapore 440058',
    context: {
      country: {
        name: 'Singapore',
        country_code: 'SG',
      },
      place: {
        name: 'Marine Parade',
      },
    },
  })

  const match = findDirectMatchSuggestion('58 marine terrace sg', [suggestion])
  assert.equal(match?.id, '58-marine-terrace-sg')
})
