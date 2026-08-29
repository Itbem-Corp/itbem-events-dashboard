import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('events list feature boundary', () => {
  it('keeps the events list query scoped to the active tenant route', () => {
    const page = readSource('src/app/(app)/events/page.tsx')

    expect(page).toContain('useScopedFetcherKey')
    expect(page).toContain('scopedEventsPagePath')
    expect(page).toContain('useSWR<EventListPage>')
  })

  it('keeps query construction, cache updates and cover refresh in the feature hook', () => {
    const feature = readSource('src/features/events/use-events-list.ts')

    expect(feature).toContain('scopedEventsPagePath')
    expect(feature).toContain('upsertEventCacheValue')
    expect(feature).toContain('removeEventCacheValue')
    expect(feature).toContain('getEventCoversRefreshDelay')
  })
})
