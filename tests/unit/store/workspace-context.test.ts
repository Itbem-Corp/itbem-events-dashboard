import { useStore } from '@/store/useStore'
import { beforeEach, describe, expect, it } from 'vitest'

const eventiOrganization = {
  id: 'eventi-org',
  name: 'Eventi Organization',
  code: 'eventi-org',
  client_type: { code: 'CUSTOMER' },
}

const itbemOrganization = {
  id: 'itbem-org',
  name: 'ITBEM Organization',
  code: 'itbem-org',
  client_type: { code: 'CUSTOMER' },
}

describe('tenant workspace context', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('keeps organization selection isolated by product', () => {
    useStore.getState().activateTenantWorkspace('eventiapp', true)
    useStore.getState().selectOrganizationWorkspace('eventiapp', eventiOrganization)
    useStore.getState().activateTenantWorkspace('itbem', true)
    useStore.getState().selectOrganizationWorkspace('itbem', itbemOrganization)

    useStore.getState().activateTenantWorkspace('eventiapp', true)
    expect(useStore.getState().currentClient?.id).toBe('eventi-org')

    useStore.getState().activateTenantWorkspace('itbem', true)
    expect(useStore.getState().currentClient?.id).toBe('itbem-org')
  })

  it('restores platform mode only for users allowed to use it', () => {
    useStore.getState().selectPlatformWorkspace('itbem')
    useStore.getState().activateTenantWorkspace('itbem', true)
    expect(useStore.getState().workspaceMode).toBe('platform')

    useStore.getState().activateTenantWorkspace('itbem', false)
    expect(useStore.getState().workspaceMode).toBe('organization')
  })
})
