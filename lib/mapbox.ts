export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Outdoors style as a base, customised toward warm earth tones in Mapbox Studio.
export const MAPBOX_STYLE = "mapbox://styles/mapbox/outdoors-v12";

export const DEFAULT_CENTER: [number, number] = [-87.6298, 41.8781]; // Chicago fallback
export const DEFAULT_ZOOM = 13;
