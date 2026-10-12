import type { OrganizationContextCredential } from '@/lib/request-context'
import { useStore } from '@/store/useStore'
import { beforeEach, describe, expect, it } from 'vitest'

const eventiOrganization = {
  id: 'eventi-org',
  name: 'Eventi Organization',
  code: 'eventi-org',
  client_type: { code: 'CUSTOMER' },
}

const otherEventiOrganization = {
  id: 'eventi-org-2',
  name: 'Second Eventi Organization',
  code: 'eventi-org-2',
  client_type: { code: 'CUSTOMER' },
}

const itbemOrganization = {
  id: 'itbem-org',
  name: 'ITBEM Organization',
  code: 'itbem-org',
  client_type: { code: 'CUSTOMER' },
}

function credential(organizationId: string): OrganizationContextCredential {
  return { token: `token-${organizationId}`, organizationId, expiresAt: '2099-01-01T00:00:00.000Z' }
}

const organizationMember = { canUsePlatformMode: false }
const platformUser = { canUsePlatformMode: true }

describe('tenant workspace context', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('keeps organization selection isolated by product', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', platformUser)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization)
    useStore.getState().activateTenantWorkspace('itbem', platformUser)
    useStore.getState().selectOrganizationWorkspace('itbem', itbemOrganization)

    useStore.getState().activateTenantWorkspace('eventiapp', platformUser)
    expect(useStore.getState().currentClient?.id).toBe('eventi-org')

    useStore.getState().activateTenantWorkspace('itbem', platformUser)
    expect(useStore.getState().currentClient?.id).toBe('itbem-org')
  })

  it('restores platform mode only for users allowed to use it', () => {
    useStore.getState().selectPlatformWorkspace('itbem')
    useStore.getState().activateTenantWorkspace('itbem', platformUser)
    expect(useStore.getState().workspaceMode).toBe('platform')

    useStore.getState().activateTenantWorkspace('itbem', organizationMember)
    expect(useStore.getState().workspaceMode).toBe('organization')
  })
})

describe('caller-access portfolio workspace', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('overwrites a persisted organization and never restores it as the current client', () => {
    // A returning member: the organization chosen on an earlier visit is
    // still in localStorage, but this product now uses caller access.
    useStore.setState({
      workspaceContexts: { eventiapp: { mode: 'organization', organization: eventiOrganization } },
    })

    useStore.getState().activateTenantWorkspace('eventiapp', { ...organizationMember, portfolio: true })

    const state = useStore.getState()
    expect(state.workspaceMode).toBe('organization')
    expect(state.currentClient).toBeNull()
    expect(state.organizationContext).toBeNull()
    expect(state.workspacePortfolio).toBe(true)
    expect(state.workspaceContexts.eventiapp).toEqual({ mode: 'organization', organization: null, portfolio: true })
  })

  it('restores a selected portfolio only when the user may still choose it', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectPortfolioWorkspace('eventiapp')

    useStore.getState().activateTenantWorkspace('eventiapp', { ...organizationMember, allowPortfolioSelection: true })
    expect(useStore.getState().workspacePortfolio).toBe(true)
    expect(useStore.getState().currentClient).toBeNull()

    // The grants went away: fall back to today's organization bootstrap.
    useStore.getState().activateTenantWorkspace('eventiapp', { ...organizationMember, allowPortfolioSelection: false })
    expect(useStore.getState().workspacePortfolio).toBe(false)
    expect(useStore.getState().workspaceMode).toBe('organization')
    expect(useStore.getState().currentClient).toBeNull()
  })

  it('moves between the portfolio and an organization', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))

    useStore.getState().selectPortfolioWorkspace('eventiapp')
    let state = useStore.getState()
    expect(state.workspacePortfolio).toBe(true)
    expect(state.workspaceMode).toBe('organization')
    expect(state.currentClient).toBeNull()
    expect(state.organizationContext).toBeNull()
    expect(state.workspaceContexts.eventiapp).toEqual({ mode: 'organization', organization: null, portfolio: true })

    useStore.getState().selectOrganizationWorkspace('eventiapp', otherEventiOrganization, credential('eventi-org-2'))
    state = useStore.getState()
    expect(state.workspacePortfolio).toBe(false)
    expect(state.currentClient?.id).toBe('eventi-org-2')
    expect(state.organizationContext?.organizationId).toBe('eventi-org-2')
    expect(state.workspaceContexts.eventiapp).toEqual({ mode: 'organization', organization: otherEventiOrganization })

    useStore.getState().selectPortfolioWorkspace('eventiapp')
    useStore.getState().selectPlatformWorkspace('eventiapp')
    state = useStore.getState()
    expect(state.workspacePortfolio).toBe(false)
    expect(state.workspaceMode).toBe('platform')
    expect(state.workspaceContexts.eventiapp).toEqual({ mode: 'platform', organization: null })
  })

  it('does not persist the in-memory portfolio flag', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', { ...organizationMember, portfolio: true })

    const partialize = useStore.persist.getOptions().partialize
    const persisted = partialize?.(useStore.getState()) as Record<string, unknown>
    expect(Object.keys(persisted)).toEqual(['workspaceContexts'])
    expect(persisted).not.toHaveProperty('workspacePortfolio')
  })
})

describe('organization context credential on re-activation', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('keeps the credential when the same tenant and organization are activated again', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))

    // A revalidated session re-runs the activation with the same workspace.
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)

    expect(useStore.getState().currentClient?.id).toBe('eventi-org')
    expect(useStore.getState().organizationContext).toEqual(credential('eventi-org'))
  })

  it('drops the credential on a tenant change', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))

    useStore.getState().activateTenantWorkspace('itbem', organizationMember)

    expect(useStore.getState().organizationContext).toBeNull()
  })

  it('drops the credential when the restored workspace is the platform', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', platformUser)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))
    useStore.setState({
      workspaceContexts: { eventiapp: { mode: 'platform', organization: null } },
    })

    useStore.getState().activateTenantWorkspace('eventiapp', platformUser)

    expect(useStore.getState().workspaceMode).toBe('platform')
    expect(useStore.getState().organizationContext).toBeNull()
  })

  it('drops the credential when the restored organization is a different one', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))
    useStore.setState({
      workspaceContexts: { eventiapp: { mode: 'organization', organization: otherEventiOrganization } },
    })

    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)

    expect(useStore.getState().currentClient?.id).toBe('eventi-org-2')
    expect(useStore.getState().organizationContext).toBeNull()
  })

  it('drops the credential when the portfolio is activated', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', organizationMember)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization, credential('eventi-org'))

    useStore.getState().activateTenantWorkspace('eventiapp', { ...organizationMember, portfolio: true })

    expect(useStore.getState().organizationContext).toBeNull()
    expect(useStore.getState().currentClient).toBeNull()
  })
})
