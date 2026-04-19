import assert from 'node:assert/strict'
import test from 'node:test'
import {
  toSearchSuggestion,
  type GeoapifyAutocompleteResult,
} from '../../../../components/map/searchTypes'

test('toSearchSuggestion normalizes Geoapify POI results into searchable suggestions', () => {
  const result: GeoapifyAutocompleteResult = {
    place_id: 'geoapify-poi',
    name: 'Starbucks',
    housenumber: '150',
    street: 'Van Ness Avenue',
    address_line1: '150 Van Ness Avenue',
    address_line2: 'San Francisco, California 94102, United States',
    formatted: 'Starbucks, 150 Van Ness Avenue, San Francisco, California 94102, United States',
    lat: 37.7764,
    lon: -122.4192,
    result_type: 'amenity',
    category: 'catering.cafe',
    city: 'San Francisco',
    state: 'California',
    state_code: 'CA',
    country: 'United States',
    country_code: 'us',
    postcode: '94102',
    datasource: {
      raw: {
        osm_id: 123,
        osm_type: 'node',
        type: 'cafe',
      },
    },
  }

  const suggestion = toSearchSuggestion(result)

  assert.equal(suggestion.name, 'Starbucks')
  assert.equal(suggestion.featureType, 'poi')
  assert.equal(suggestion.address, '150 Van Ness Avenue')
  assert.equal(suggestion.placeFormatted, 'San Francisco, California 94102, United States')
  assert.equal(suggestion.lat, 37.7764)
  assert.equal(suggestion.lng, -122.4192)
})

test('toSearchSuggestion strips the duplicated street line from Geoapify POI address_line2', () => {
  const result: GeoapifyAutocompleteResult = {
    place_id: 'geoapify-poi-live-shape',
    name: 'Starbucks',
    housenumber: '150',
    street: 'Van Ness Avenue',
    address_line1: 'Starbucks',
    address_line2: '150 Van Ness Avenue, San Francisco, CA 94102, United States of America',
    formatted: 'Starbucks, 150 Van Ness Avenue, San Francisco, CA 94102, United States of America',
    lat: 37.7772288,
    lon: -122.41938,
    result_type: 'amenity',
    category: 'catering.cafe',
  }

  const suggestion = toSearchSuggestion(result)

  assert.equal(suggestion.address, '150 Van Ness Avenue')
  assert.equal(suggestion.placeFormatted, 'San Francisco, CA 94102, United States of America')
})

test('toSearchSuggestion normalizes Geoapify address results without duplicating the street label', () => {
  const result: GeoapifyAutocompleteResult = {
    place_id: 'geoapify-address',
    housenumber: '415',
    street: 'Mission Street',
    address_line1: '415 Mission Street',
    address_line2: 'San Francisco, California 94105, United States',
    formatted: '415 Mission Street, San Francisco, California 94105, United States',
    lat: 37.7897,
    lon: -122.3969,
    result_type: 'street',
    city: 'San Francisco',
    state: 'California',
    state_code: 'CA',
    country: 'United States',
    country_code: 'us',
    postcode: '94105',
  }

  const suggestion = toSearchSuggestion(result)

  assert.equal(suggestion.name, '415 Mission Street')
  assert.equal(suggestion.featureType, 'address')
  assert.equal(suggestion.address, '415 Mission Street')
  assert.equal(suggestion.placeFormatted, 'San Francisco, California 94105, United States')
})
