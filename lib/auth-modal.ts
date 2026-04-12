export const OPEN_AUTH_MODAL_EVENT = 'nook:open-auth-modal'

export function dispatchOpenAuthModal() {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(OPEN_AUTH_MODAL_EVENT))
}
