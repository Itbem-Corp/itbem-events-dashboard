export const NAVIGATION_PROGRESS_START = 'eventi:navigation-progress-start'

/** Starts the shared route-progress feedback for imperative and Link navigation. */
export function beginNavigationProgress() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(NAVIGATION_PROGRESS_START))
}
