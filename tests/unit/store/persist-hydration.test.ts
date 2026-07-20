import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('persisted dashboard state', () => {
  it('waits for explicit client hydration before applying persisted state', async () => {
    localStorage.setItem(
      'eventi-storage',
      JSON.stringify({
        state: {
          user: {
            id: 'root-1',
            email: 'root@example.com',
            first_name: 'Root',
            last_name: 'User',
            is_root: true,
          },
          currentClient: {
            id: 'legacy-client',
            name: 'Legacy client',
            code: 'legacy',
            client_type: { code: 'CUSTOMER' },
          },
        },
        version: 0,
      })
    )

    const { useStore } = await import('@/store/useStore')

    expect(useStore.persist.hasHydrated()).toBe(false)
    expect(useStore.getState().user).toBeNull()

    await useStore.persist.rehydrate()

    expect(useStore.persist.hasHydrated()).toBe(true)
    expect(useStore.getState().user).toBeNull()
    expect(useStore.getState().currentClient).toBeNull()
    expect(useStore.getState().workspaceContexts).toEqual({})
  })

  it('deduplicates concurrent hydration requests from the app shell', async () => {
    const { useStore } = await import('@/store/useStore')
    const { ensureStoreHydrated } = await import('@/hooks/useStoreHydration')
    const rehydrate = vi.spyOn(useStore.persist, 'rehydrate')

    await Promise.all([ensureStoreHydrated(), ensureStoreHydrated()])

    expect(rehydrate).toHaveBeenCalledOnce()
    expect(useStore.persist.hasHydrated()).toBe(true)
  })

  it('keeps organization credentials in memory and clears them on workspace changes', async () => {
    const { useStore } = await import('@/store/useStore')
    const client = { id: 'org-1', name: 'Org 1', code: 'ORG1', client_type: { code: 'CUSTOMER' } }
    useStore.getState().selectOrganizationWorkspace('eventiapp', client, {
      token: 'signed-context',
      organizationId: 'org-1',
      expiresAt: '2099-01-01T00:00:00Z',
    })

    expect(useStore.getState().organizationContext?.token).toBe('signed-context')
    expect(useStore.persist.getOptions().partialize?.(useStore.getState())).not.toHaveProperty('organizationContext')

    useStore.getState().selectPlatformWorkspace('eventiapp')
    expect(useStore.getState().organizationContext).toBeNull()
  })

  it('ignores a late credential response after the selected organization changed', async () => {
    const { useStore } = await import('@/store/useStore')
    const first = { id: 'org-1', name: 'Org 1', code: 'ORG1', client_type: { code: 'CUSTOMER' } }
    const second = { id: 'org-2', name: 'Org 2', code: 'ORG2', client_type: { code: 'CUSTOMER' } }
    useStore.getState().selectOrganizationWorkspace('eventiapp', first)
    useStore.getState().selectOrganizationWorkspace('eventiapp', second)
    useStore.getState().setOrganizationContextCredential({
      token: 'late-org-1-token',
      organizationId: 'org-1',
      expiresAt: '2099-01-01T00:00:00Z',
    })

    expect(useStore.getState().currentClient?.id).toBe('org-2')
    expect(useStore.getState().organizationContext).toBeNull()
  })
})
