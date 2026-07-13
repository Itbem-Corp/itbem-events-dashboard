import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/users/[id]/clients/page.tsx'), 'utf8')

describe('user client memberships route', () => {
  it('loads compact identity and paginated memberships from one composed request', () => {
    expect(page).not.toContain('userSummaryPath(id)')
    expect(page).toContain('userClientsPagePath(id, page, 20, debouncedSearch)')
    expect(page.match(/useSWR</g)).toHaveLength(1)
  })

  it('keeps the membership manager outside the initial route chunk', () => {
    expect(page).toContain("const loadClientMembersModal = () => import('@/components/clients/client-members-modal')")
    expect(page).toContain('dynamic(() => loadClientMembersModal()')
    expect(page).toMatch(/ssr:\s*false/)
    expect(page).toContain('preload(clientMembersPagePath(clientId, 1, 20), fetcher)')
    expect(page).not.toContain('preload(clientMembersPath(clientId), fetcher)')
    expect(page).toContain('preload(clientRolesPath(clientId), fetcher)')
  })

  it('keeps cached memberships visible during a background refresh failure', () => {
    expect(page).toContain('responsiveListSwrOptions')
    expect(page).toContain('getDataErrorState(clientsError, clientsPage)')
    expect(page).toContain("clientsErrorState === 'fatal'")
    expect(page).toContain("clientsErrorState === 'stale'")
    expect(page).toContain('<StaleDataNotice')
  })
})
