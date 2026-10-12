import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('check-in embedded summary loading', () => {
  it('uses the paginated response as the single live source', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/[id]/checkin/page.tsx'), 'utf8')

    expect(source).toContain('const summary = guestsPage?.summary')
    expect(source).not.toContain('eventGuestSummaryPath')
    expect(source).not.toContain('mutate(summaryKey)')
  })

  it('patches caches optimistically and revalidates after a door write (bulk/status returns no guest)', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/[id]/checkin/page.tsx'), 'utf8')

    expect(source).toContain('await patchCaches(guest, optimisticGuest)')
    expect(source).toContain('checked_in_at: new Date().toISOString()')
    expect(source).toContain('revalidateCaches()')
    expect(source).not.toContain('mergeGuestCacheUpdate')
  })
})
