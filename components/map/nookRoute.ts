const NOOK_PATH_PREFIX = '/nook/'

export function getNookUrl(id: string): string {
  return `${NOOK_PATH_PREFIX}${encodeURIComponent(id)}`
}

export function getSelectedNookIdFromUrl(pathname: string): string | null {
  if (pathname.startsWith(NOOK_PATH_PREFIX)) {
    const encodedId = pathname.slice(NOOK_PATH_PREFIX.length).split('/')[0]
    if (!encodedId) return null

    try {
      return decodeURIComponent(encodedId)
    } catch {
      return encodedId
    }
  }

  return null
}
