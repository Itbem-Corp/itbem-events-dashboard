export const SESSION_SYNC_STORAGE_KEY = 'eventi:session-sync'

/**
 * Ends the browser session through the same-origin logout endpoint.
 *
 * The refresh credential is HttpOnly, so JavaScript cannot delete or revoke
 * it directly. Keeping that operation on the server also makes logout
 * consistent across the three product hostnames.
 */
export function notifyOtherTabsOfSessionEnd() {
  if (typeof window === 'undefined') return

  // Storage is only a signal; it intentionally contains no token, profile or
  // tenant information. It covers browsers where BroadcastChannel is absent.
  try {
    window.localStorage.setItem(SESSION_SYNC_STORAGE_KEY, String(Date.now()))
  } catch {}

  try {
    const channel = new BroadcastChannel(SESSION_SYNC_STORAGE_KEY)
    channel.postMessage('signed-out')
    channel.close()
  } catch {}
}

export async function endSession(clearLocalState?: () => void) {
  clearLocalState?.()

  if (typeof window === 'undefined') return

  try {
    const response = await fetch('/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (response.ok) notifyOtherTabsOfSessionEnd()
  } finally {
    window.location.assign('/login')
  }
}
