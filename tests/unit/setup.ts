import '@testing-library/jest-dom'

// Replace the happy-dom IntersectionObserver stub (which has a no-op observe())
// with one that immediately fires isIntersecting:true, so lazy-loaded components
// render their media content in unit tests without needing real scroll events.
// Tests that need to control IntersectionObserver behavior (e.g. useLazyVisible.test.ts)
// can override this per-test via vi.stubGlobal().
class IntersectionObserverImmediate {
  private cb: (entries: IntersectionObserverEntry[]) => void
  constructor(cb: (entries: IntersectionObserverEntry[]) => void, _options?: IntersectionObserverInit) {
    this.cb = cb
  }
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry])
  }
  unobserve() {}
  disconnect() {}
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  takeRecords(): IntersectionObserverEntry[] { return [] }
}
// @ts-expect-error — replace happy-dom's no-op stub with an immediately-firing one
globalThis.IntersectionObserver = IntersectionObserverImmediate
