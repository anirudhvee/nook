const PASSPORT_PATH = '/passport'

export function getPassportUrl(highlightNookId?: string | null): string {
  if (!highlightNookId) return PASSPORT_PATH

  const params = new URLSearchParams({
    highlight: highlightNookId,
  })

  return `${PASSPORT_PATH}?${params.toString()}`
}

export function isPassportPath(pathname: string): boolean {
  return pathname === PASSPORT_PATH
}
