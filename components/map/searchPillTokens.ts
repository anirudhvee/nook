export const STREET_TYPE_TOKENS: Record<string, string> = {
  st: 'street',
  street: 'street',
  ave: 'avenue',
  av: 'avenue',
  avenue: 'avenue',
  blvd: 'boulevard',
  boulevard: 'boulevard',
  rd: 'road',
  road: 'road',
  dr: 'drive',
  drive: 'drive',
  ln: 'lane',
  lane: 'lane',
  ct: 'court',
  court: 'court',
  pl: 'place',
  place: 'place',
  ter: 'terrace',
  terrace: 'terrace',
  hwy: 'highway',
  highway: 'highway',
  pkwy: 'parkway',
  parkway: 'parkway',
  sq: 'square',
  square: 'square',
}

function normalizeStreetTypeToken(token: string): string {
  return token
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function getCanonicalStreetType(token: string): string | null {
  return STREET_TYPE_TOKENS[normalizeStreetTypeToken(token)] ?? null
}

export function findStreetTypeIndex(tokens: string[], startIndex = 0): number {
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (getCanonicalStreetType(tokens[index] ?? '')) return index
  }

  return -1
}
