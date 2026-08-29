import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const page = readFileSync(resolve(root, 'src/app/(app)/page.tsx'), 'utf8')
const feature = readFileSync(resolve(root, 'src/features/events/use-events-dashboard.ts'), 'utf8')

describe('events dashboard feature boundary', () => {
  it('keeps the dashboard query scoped to the active tenant route', () => {
    expect(page).toContain('useScopedFetcherKey')
    expect(page).toContain('scopedEventsDashboardPath')
    expect(page).toContain('useSWR<EventDashboardOverview>')
    expect(feature).toContain('useSWR<EventDashboardOverview>')
    expect(feature).toContain('scopedEventsDashboardPath')
  })
})
