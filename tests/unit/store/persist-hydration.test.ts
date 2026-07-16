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
    expect(useStore.getState().user?.email).toBe('root@example.com')
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
})
