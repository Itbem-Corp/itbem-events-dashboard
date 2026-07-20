import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('feature boundaries', () => {
  it('keeps event workspace transport out of route composition', () => {
    const checkinPage = source('src/app/(app)/events/[id]/checkin/page.tsx')
    const studioPage = source('src/app/(app)/events/[id]/studio/page.tsx')

    expect(checkinPage).toContain("from '@/features/events/checkin/use-checkin-workspace'")
    expect(checkinPage).toContain("from '@/features/events/use-event-capabilities'")
    expect(checkinPage).not.toContain('checkinWorkspacePath')
    expect(checkinPage).not.toContain('eventCapabilitiesPath')

    expect(studioPage).toContain("from '@/features/events/studio/use-studio-workspace'")
    expect(studioPage).toContain("from '@/features/events/use-event-capabilities'")
    expect(studioPage).not.toContain('studioWorkspacePath')
    expect(studioPage).not.toContain('eventCapabilitiesPath')
  })

  it('keeps client and user list transport inside their features', () => {
    const clientsPage = source('src/app/(app)/clients/page.tsx')
    const usersPage = source('src/app/(app)/users/page.tsx')

    expect(clientsPage).toContain("from '@/features/clients/use-clients-page'")
    expect(clientsPage).not.toContain('clientsPagePath')
    expect(usersPage).toContain("from '@/features/users/use-users-page'")
    expect(usersPage).not.toContain('usersAllPath')
  })

  it('prevents feature data modules from depending on Next route composition', () => {
    for (const path of [
      'src/features/events/use-event-capabilities.ts',
      'src/features/events/checkin/use-checkin-workspace.ts',
      'src/features/events/studio/use-studio-workspace.ts',
      'src/features/clients/use-clients-page.ts',
      'src/features/users/use-users-page.ts',
    ]) {
      const feature = source(path)
      expect(feature).not.toContain("from '@/app/")
      expect(feature).not.toContain("from 'next/navigation'")
    }
  })
})
