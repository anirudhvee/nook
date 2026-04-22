import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDiscoveryUrl,
  getNookUrl,
  getSearchContextFromParams,
  getSelectedNookSlugFromUrl,
} from '../../../../components/map/nookRoute'

test('getNookUrl builds the canonical nook path', () => {
  assert.equal(getNookUrl('ritual-coffee-san-francisco-a1b2'), '/nook/ritual-coffee-san-francisco-a1b2')
})

test('getNookUrl preserves search context when provided', () => {
  assert.equal(
    getNookUrl('tully-s-coffee-oakland-d33f', {
      name: 'Oakland, CA',
      lat: 37.8043514,
      lng: -122.2711639,
    }),
    '/nook/tully-s-coffee-oakland-d33f?q=Oakland%2C+CA&lat=37.8043514&lng=-122.2711639',
  )
})

test('getDiscoveryUrl preserves search context on the discovery page', () => {
  assert.equal(
    getDiscoveryUrl({
      name: 'Oakland, CA',
      lat: 37.8043514,
      lng: -122.2711639,
    }),
    '/?q=Oakland%2C+CA&lat=37.8043514&lng=-122.2711639',
  )
})

test('getSelectedNookSlugFromUrl reads nook slugs from the pathname', () => {
  assert.equal(
    getSelectedNookSlugFromUrl('/nook/ritual-coffee-san-francisco-a1b2'),
    'ritual-coffee-san-francisco-a1b2',
  )
})

test('getSelectedNookSlugFromUrl decodes encoded pathname segments', () => {
  assert.equal(getSelectedNookSlugFromUrl('/nook/abc%2F123'), 'abc/123')
})

test('getSelectedNookSlugFromUrl returns null when there is no selected nook in the URL', () => {
  assert.equal(getSelectedNookSlugFromUrl('/'), null)
})

test('getSearchContextFromParams reads valid search context', () => {
  const params = new URLSearchParams('q=Oakland%2C+CA&lat=37.8043514&lng=-122.2711639')

  assert.deepEqual(getSearchContextFromParams(params), {
    name: 'Oakland, CA',
    lat: 37.8043514,
    lng: -122.2711639,
  })
})

test('getSearchContextFromParams ignores missing or invalid search context', () => {
  assert.equal(getSearchContextFromParams(new URLSearchParams('q=Oakland%2C+CA&lat=200&lng=-122')), null)
  assert.equal(getSearchContextFromParams(new URLSearchParams('q=&lat=37&lng=-122')), null)
  assert.equal(getSearchContextFromParams(new URLSearchParams('q=Oakland%2C+CA')), null)
  assert.equal(getSearchContextFromParams(new URLSearchParams('q=Oakland%2C+CA&lat=&lng=-122')), null)
  assert.equal(getSearchContextFromParams(new URLSearchParams('q=Oakland%2C+CA&lat=37')), null)
})
