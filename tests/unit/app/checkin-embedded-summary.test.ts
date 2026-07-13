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

  it('reconciles authoritative check-in responses without refetching the workspace', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/[id]/checkin/page.tsx'), 'utf8')

    expect(source).toContain('const cacheGuest = mergeGuestCacheUpdate(updatedGuest, optimisticGuest)')
    expect(source).toContain('if (!updatedGuest?.id) revalidateCaches()')
    expect(source).not.toContain('await patchCaches(optimisticGuest, cacheGuest)\n      revalidateCaches()')
  })
})
