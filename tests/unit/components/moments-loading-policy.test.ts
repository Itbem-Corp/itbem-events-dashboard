import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/events/moments-wall.tsx'), 'utf8')

describe('moments loading policy', () => {
  it('reuses the intent-prefetched collection while retaining live refresh', () => {
    expect(source).toContain('...responsiveListSwrOptions')
    expect(source).toContain('refreshInterval: isPageActive && liveRefreshEnabled && !dragMode ? REFRESH_INTERVAL : 0')
  })

  it('distinguishes a missing collection from a failed background refresh', () => {
    expect(source).toContain('getDataErrorState(momentsError, momentPages)')
    expect(source).toContain("momentsErrorState === 'fatal'")
    expect(source).toContain("momentsErrorState === 'stale'")
    expect(source).toContain('<StaleDataNotice')
  })
})
