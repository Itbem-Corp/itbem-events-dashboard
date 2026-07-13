import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/events/seating/seating-plan-v2.tsx'), 'utf8')

describe('seating loading policy', () => {
  it('reuses the intent-prefetched seating workspace with the shared deduplication window', () => {
    expect(source).toContain('useSWR<SeatingWorkspace>(eventSeatingWorkspacePath(eventId), fetcher, responsiveListSwrOptions)')
  })

  it('waits for the complete workspace before deciding that no guests exist', () => {
    expect(source).toContain('workspaceLoading && workspace === undefined')
    expect(source).toContain('if (guests.length === 0)')
  })

  it('keeps a cached seating workspace operational after refresh errors', () => {
    expect(source).toContain('getDataErrorState(workspaceError, workspace)')
    expect(source).toContain('workspaceFatalError')
    expect(source).toContain('workspaceStaleError')
    expect(source).toContain('<StaleDataNotice')
  })
})
