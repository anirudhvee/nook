import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPassportLocationLine,
  extractCity,
  extractNeighborhood,
  extractRegion,
} from '../../../lib/google-places-address'

test('buildPassportLocationLine prefers neighborhood plus city', () => {
  assert.equal(
    buildPassportLocationLine({
      neighborhood: 'Mission',
      city: 'San Francisco',
      region: 'CA',
    }),
    'Mission, San Francisco',
  )
})

test('buildPassportLocationLine falls back to city and region when needed', () => {
  assert.equal(
    buildPassportLocationLine({
      city: 'San Francisco',
      region: 'CA',
    }),
    'San Francisco, CA',
  )
})

test('address component helpers tolerate entries without a types array', () => {
  const components = [
    { longText: 'Unnamed', shortText: 'Unnamed' },
    { longText: 'Sector 54', shortText: 'Sector 54', types: ['sublocality_level_1'] },
    { longText: 'Gurugram', shortText: 'Gurugram', types: ['locality'] },
    { longText: 'Haryana', shortText: 'HR', types: ['administrative_area_level_1'] },
  ]

  assert.equal(extractNeighborhood(components), 'Sector 54')
  assert.equal(extractCity(components), 'Gurugram')
  assert.equal(extractRegion(components), 'HR')
})
