import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const page = readFileSync(resolve(root, 'src/app/(app)/page.tsx'), 'utf8')
const feature = readFileSync(resolve(root, 'src/features/events/use-events-dashboard.ts'), 'utf8')

describe('events dashboard feature boundary', () => {
  it('keeps dashboard transport and cache ownership out of the route', () => {
    expect(page).toContain("@/features/events/use-events-dashboard")
    expect(page).not.toContain("@/lib/fetcher'")
    expect(page).not.toContain("@/lib/api-envelope'")
    expect(page).not.toContain('useSWR<EventDashboardOverview>')
    expect(feature).toContain('useSWR<EventDashboardOverview>')
    expect(feature).toContain('scopedEventsDashboardPath')
  })
})
