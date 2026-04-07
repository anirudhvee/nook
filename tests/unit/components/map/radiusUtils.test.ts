import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatRadius,
  createCirclePolygon,
  getCircleBounds,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  DEFAULT_RADIUS_M,
} from '../../../../components/map/radiusUtils'

// ── formatRadius ─────────────────────────────────────────────────────────────

test('formatRadius returns meters when < 1000m (km mode)', () => {
  assert.equal(formatRadius(500, false), '500m')
  assert.equal(formatRadius(999, false), '999m')
})

test('formatRadius returns km with one decimal when >= 1000m (km mode)', () => {
  assert.equal(formatRadius(1000, false), '1.0 km')
  assert.equal(formatRadius(1500, false), '1.5 km')
  assert.equal(formatRadius(5000, false), '5.0 km')
})

test('formatRadius returns miles with one decimal (miles mode)', () => {
  // 1609.34m = exactly 1 mile
  assert.equal(formatRadius(1609, true), '1.0 mi')
  // 500m ≈ 0.3107 mi → "0.3 mi"
  assert.equal(formatRadius(500, true), '0.3 mi')
  // 5000m ≈ 3.107 mi → "3.1 mi"
  assert.equal(formatRadius(5000, true), '3.1 mi')
})

test('formatRadius DEFAULT_RADIUS_M yields "1.6 km" in km mode', () => {
  assert.equal(formatRadius(DEFAULT_RADIUS_M, false), '1.6 km')
})

test('formatRadius DEFAULT_RADIUS_M yields "1.0 mi" in miles mode', () => {
  assert.equal(formatRadius(DEFAULT_RADIUS_M, true), '1.0 mi')
})

test('formatRadius MIN and MAX are self-consistent across unit switches', () => {
  // Switching units should change the label but the underlying value stays the same
  const minKm = formatRadius(MIN_RADIUS_M, false)
  const minMi = formatRadius(MIN_RADIUS_M, true)
  assert.notEqual(minKm, minMi)

  const maxKm = formatRadius(MAX_RADIUS_M, false)
  const maxMi = formatRadius(MAX_RADIUS_M, true)
  assert.notEqual(maxKm, maxMi)
})

// ── createCirclePolygon ───────────────────────────────────────────────────────

test('createCirclePolygon returns a closed GeoJSON Polygon', () => {
  const center: [number, number] = [-122.4194, 37.7749]
  const polygon = createCirclePolygon(center, 1500)

  assert.equal(polygon.type, 'Feature')
  assert.equal(polygon.geometry.type, 'Polygon')

  const ring = polygon.geometry.coordinates[0]
  assert.ok(ring.length > 2, 'ring should have more than 2 points')

  // First and last coordinates must be identical (closed ring)
  const first = ring[0]
  const last = ring[ring.length - 1]
  assert.deepEqual(first, last)
})

test('createCirclePolygon points are approximately the correct distance from center', () => {
  const center: [number, number] = [0, 0]
  const radiusM = 1000
  const polygon = createCirclePolygon(center, radiusM, 16)

  const ring = polygon.geometry.coordinates[0]
  const [clng, clat] = center

  for (const [lng, lat] of ring.slice(0, -1)) {
    // Approximate distance from center using equirectangular
    const dlat = (lat - clat) * 111320
    const dlng = (lng - clng) * 111320 * Math.cos(clat * Math.PI / 180)
    const dist = Math.sqrt(dlat ** 2 + dlng ** 2)
    // Allow 1% tolerance
    assert.ok(Math.abs(dist - radiusM) < radiusM * 0.01, `point distance ${dist} should be ~${radiusM}m`)
  }
})

test('createCirclePolygon respects custom step count', () => {
  const polygon = createCirclePolygon([0, 0], 500, 32)
  // steps=32 → 33 points (32 + closing point)
  assert.equal(polygon.geometry.coordinates[0].length, 33)
})

// ── getCircleBounds ───────────────────────────────────────────────────────────

test('getCircleBounds returns a box larger than the center point', () => {
  const center: [number, number] = [-122.4194, 37.7749]
  const [[minLng, minLat], [maxLng, maxLat]] = getCircleBounds(center, 1500)

  assert.ok(minLng < center[0])
  assert.ok(maxLng > center[0])
  assert.ok(minLat < center[1])
  assert.ok(maxLat > center[1])
})

test('getCircleBounds box is symmetrical around the center', () => {
  const center: [number, number] = [0, 0]
  const [[minLng, minLat], [maxLng, maxLat]] = getCircleBounds(center, 2000)

  assert.ok(Math.abs(maxLng + minLng) < 1e-10, 'lng bounds should be symmetric')
  assert.ok(Math.abs(maxLat + minLat) < 1e-10, 'lat bounds should be symmetric')
})

test('getCircleBounds grows monotonically with radius', () => {
  const center: [number, number] = [0, 0]
  const [[, minLat1], [, maxLat1]] = getCircleBounds(center, 1000)
  const [[, minLat2], [, maxLat2]] = getCircleBounds(center, 2000)

  assert.ok(maxLat2 > maxLat1, 'larger radius should produce larger bounds')
  assert.ok(minLat2 < minLat1, 'larger radius should produce smaller min lat')
})
