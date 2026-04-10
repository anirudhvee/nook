import assert from 'node:assert/strict'
import test from 'node:test'
import { getNookUrl, getSelectedNookIdFromUrl } from '../../../../components/map/nookRoute'

test('getNookUrl builds the canonical nook path', () => {
  assert.equal(getNookUrl('ChIJP7V2IER8j4ARmwqj9PK5tcw'), '/nook/ChIJP7V2IER8j4ARmwqj9PK5tcw')
})

test('getSelectedNookIdFromUrl reads nook ids from the pathname', () => {
  assert.equal(
    getSelectedNookIdFromUrl('/nook/ChIJP7V2IER8j4ARmwqj9PK5tcw'),
    'ChIJP7V2IER8j4ARmwqj9PK5tcw',
  )
})

test('getSelectedNookIdFromUrl decodes encoded pathname segments', () => {
  assert.equal(getSelectedNookIdFromUrl('/nook/abc%2F123'), 'abc/123')
})

test('getSelectedNookIdFromUrl returns null when there is no selected nook in the URL', () => {
  assert.equal(getSelectedNookIdFromUrl('/'), null)
})
