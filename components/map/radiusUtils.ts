import type { Feature, Polygon } from 'geojson'

export const DEFAULT_RADIUS_M = 1609
export const MIN_RADIUS_M = 500
export const MAX_RADIUS_M = 5000

/**
 * Format a radius in meters as a human-readable string using the current unit preference.
 */
export function formatRadius(radiusM: number, useMiles: boolean): string {
  if (useMiles) {
    const mi = radiusM / 1609.34
    return `${mi.toFixed(1)} mi`
  }
  if (radiusM < 1000) return `${radiusM}m`
  return `${(radiusM / 1000).toFixed(1)} km`
}

/**
 * Generate a GeoJSON Polygon approximating a circle centered at [lng, lat].
 * Uses equirectangular projection — accurate enough for typical search radii (< 10km).
 */
export function createCirclePolygon(
  center: [number, number],
  radiusM: number,
  steps = 64,
): Feature<Polygon> {
  const [lng, lat] = center
  const latRad = lat * (Math.PI / 180)
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(latRad)

  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    coords.push([
      lng + (radiusM * Math.sin(angle)) / metersPerDegLng,
      lat + (radiusM * Math.cos(angle)) / metersPerDegLat,
    ])
  }

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  }
}

/**
 * Return the axis-aligned bounding box for a circle: [[minLng, minLat], [maxLng, maxLat]].
 */
export function getCircleBounds(
  center: [number, number],
  radiusM: number,
): [[number, number], [number, number]] {
  const [lng, lat] = center
  const latRad = lat * (Math.PI / 180)
  const latDelta = radiusM / 111320
  const lngDelta = radiusM / (111320 * Math.cos(latRad))
  return [
    [lng - lngDelta, lat - latDelta],
    [lng + lngDelta, lat + latDelta],
  ]
}
