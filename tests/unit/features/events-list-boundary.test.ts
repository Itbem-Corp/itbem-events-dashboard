import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('events list feature boundary', () => {
  it('keeps remote list state out of the App Router page', () => {
    const page = readSource('src/app/(app)/events/page.tsx')

    expect(page).toContain("from '@/features/events/use-events-list'")
    expect(page).not.toContain("from '@/lib/api-envelope'")
    expect(page).not.toContain("from '@/lib/api-paths'")
    expect(page).not.toContain("from '@/lib/event-cache'")
    expect(page).not.toContain("from '@/lib/fetcher'")
  })

  it('keeps query construction, cache updates and cover refresh in the feature hook', () => {
    const feature = readSource('src/features/events/use-events-list.ts')

    expect(feature).toContain('scopedEventsPagePath')
    expect(feature).toContain('upsertEventCacheValue')
    expect(feature).toContain('removeEventCacheValue')
    expect(feature).toContain('getEventCoversRefreshDelay')
  })
})
