import type { StyleSpecification } from 'maplibre-gl'

/**
 * Monochrome map style on OpenFreeMap vector tiles, designed to be tinted
 * downstream into a duotone (paper + per-type ink) inside the stamp SVG.
 *
 * The base style renders neutral tones so the SVG <feColorMatrix> can map
 * darks -> ink and lights -> paper without polychrome interference.
 */
export const STAMP_MAP_PAPER = '#f4ead0'
export const STAMP_MAP_INK = '#1a1a1a'

export function buildStampMapStyle(): StyleSpecification {
  const ink = STAMP_MAP_INK
  const paper = STAMP_MAP_PAPER

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      ofm: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
    },
    layers: [
      {
        id: 'paper',
        type: 'background',
        paint: { 'background-color': paper },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'grass', 'wood', 'forest'],
        paint: { 'fill-color': ink, 'fill-opacity': 0.16 },
      },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'landuse',
        filter: ['in', 'class', 'park', 'cemetery', 'pitch', 'playground', 'garden'],
        paint: { 'fill-color': ink, 'fill-opacity': 0.20 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'water',
        paint: { 'fill-color': ink, 'fill-opacity': 0.55 },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': ink, 'fill-opacity': 0.28 },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'minor', 'service', 'track', 'pedestrian', 'path'],
        minzoom: 13,
        paint: {
          'line-color': paper,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.0, 18, 2.6],
          'line-opacity': 0.9,
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'minor', 'service', 'track', 'pedestrian', 'path'],
        minzoom: 13,
        paint: {
          'line-color': ink,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.45, 18, 1.2],
          'line-opacity': 0.85,
        },
      },
      {
        id: 'road-secondary-casing',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        paint: {
          'line-color': paper,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.0, 18, 4.6],
        },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        paint: {
          'line-color': ink,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 18, 2.0],
          'line-opacity': 0.95,
        },
      },
      {
        id: 'road-primary-casing',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'primary'],
        paint: {
          'line-color': paper,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 18, 6.6],
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'primary'],
        paint: {
          'line-color': ink,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 18, 2.8],
        },
      },
      {
        id: 'road-trunk-casing',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'trunk', 'motorway'],
        paint: {
          'line-color': paper,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.8, 18, 8.8],
        },
      },
      {
        id: 'road-trunk',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'trunk', 'motorway'],
        paint: {
          'line-color': ink,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.0, 18, 3.6],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'rail'],
        paint: {
          'line-color': ink,
          'line-width': 0.55,
          'line-dasharray': [4, 2],
          'line-opacity': 0.7,
        },
      },
    ],
  }
}
