import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')

describe('event detail stale-data policy', () => {
  it('keeps a cached event visible when its authoritative refresh fails', () => {
    expect(page).toContain('getDataErrorState(error, rawEvent)')
    expect(page).toContain("eventErrorState === 'stale'")
    expect(page).toContain('<StaleDataNotice')
    expect(page).not.toContain('if (error || !event)')
  })

  it('does not refetch a recently preloaded authoritative detail on mount', () => {
    expect(page).toContain('revalidateOnMount: id ? !eventWorkspaceCache.hasAuthoritative(id) : true')
  })
})
