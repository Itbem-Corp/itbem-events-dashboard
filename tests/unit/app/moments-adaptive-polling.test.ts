import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('moments activity polling', () => {
  it('uses embedded activity and enables fast polling only for active jobs during live events', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/events/moments-wall.tsx'), 'utf8')

    expect(source).toContain('momentPages?.[0]?.in_flight ?? []')
    expect(source).toContain('momentPages?.[0]?.reoptimizing ?? []')
    expect(source).toContain('eventId && liveRefreshEnabled && hasActiveMomentJobs ? momentActivityPath(eventId) : null')
    expect(source).toContain('refreshInterval: isPageActive && liveRefreshEnabled ? 5_000 : 0')
    expect(source).toContain('revalidateOnMount: false')
  })

  it('bounds background page loading for large event collections', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/events/moments-wall.tsx'), 'utf8')

    expect(source).toContain('mapSettledWithConcurrency(missingPages, 3')
    expect(source).not.toContain('missingPages.map((page) => api.get')
  })
})
