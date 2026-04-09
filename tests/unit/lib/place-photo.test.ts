import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlacePhotoUrl,
  DEFAULT_PLACE_PHOTO_WIDTH,
  isValidPlacePhotoRef,
  MAX_PLACE_PHOTO_WIDTH,
  parsePlacePhotoMaxWidth,
  pickPrimaryPhoto,
} from '../../../lib/place-photo'

test('pickPrimaryPhoto returns the first available Google photo', () => {
  const photo = pickPrimaryPhoto([
    { name: 'places/abc/photos/first', widthPx: 640, heightPx: 480 },
    { name: 'places/abc/photos/second', widthPx: 900, heightPx: 600 },
  ])

  assert.deepEqual(photo, {
    ref: 'places/abc/photos/first',
    width: 640,
    height: 480,
  })
})

test('pickPrimaryPhoto returns undefined when no photos are available', () => {
  assert.equal(pickPrimaryPhoto(undefined), undefined)
  assert.equal(pickPrimaryPhoto([]), undefined)
})

test('isValidPlacePhotoRef accepts the expected Places photo resource shape', () => {
  assert.equal(isValidPlacePhotoRef('places/ChIJ123/photos/AelY_Cs'), true)
})

test('isValidPlacePhotoRef rejects traversal and query-like input', () => {
  assert.equal(isValidPlacePhotoRef('places/x/photos/../../escape'), false)
  assert.equal(isValidPlacePhotoRef('places/x/photos/y?skipHttpRedirect=false'), false)
  assert.equal(isValidPlacePhotoRef('places/x/photos/y#fragment'), false)
  assert.equal(isValidPlacePhotoRef('places\\x/photos/y'), false)
})

test('parsePlacePhotoMaxWidth falls back for missing or malformed input', () => {
  assert.equal(parsePlacePhotoMaxWidth(null), DEFAULT_PLACE_PHOTO_WIDTH)
  assert.equal(parsePlacePhotoMaxWidth(''), DEFAULT_PLACE_PHOTO_WIDTH)
  assert.equal(parsePlacePhotoMaxWidth('400&skipHttpRedirect=false'), DEFAULT_PLACE_PHOTO_WIDTH)
  assert.equal(parsePlacePhotoMaxWidth('abc'), DEFAULT_PLACE_PHOTO_WIDTH)
})

test('parsePlacePhotoMaxWidth clamps numeric input to the allowed range', () => {
  assert.equal(parsePlacePhotoMaxWidth('1'), 1)
  assert.equal(parsePlacePhotoMaxWidth('640'), 640)
  assert.equal(parsePlacePhotoMaxWidth('999999'), MAX_PLACE_PHOTO_WIDTH)
})

test('buildPlacePhotoUrl encodes the photo ref and width query params', () => {
  const url = buildPlacePhotoUrl('places/abc/photos/AelY_Cs', 640)

  assert.equal(
    url,
    '/api/places/photo?ref=places%2Fabc%2Fphotos%2FAelY_Cs&maxWidth=640',
  )
})
