import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('events list moment summary loading', () => {
  it('paints pending counts from the event page without per-event summary polling', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')

    expect(source).toContain('pending_moment_count ?? 0')
    expect(source).not.toContain('momentSummaryPathsForEventIds')
    expect(source).not.toContain("'moment-summaries'")
    expect(source).not.toContain('fetchMomentSummaries')
  })
})
