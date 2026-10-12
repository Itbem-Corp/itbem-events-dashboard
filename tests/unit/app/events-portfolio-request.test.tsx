import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swr = vi.hoisted(() => ({ keys: [] as unknown[] }))

vi.mock('swr', () => ({
  default: (key: unknown) => {
    swr.keys.push(key)
    return { data: undefined, error: undefined, isLoading: true, isValidating: false, mutate: vi.fn() }
  },
  preload: () => Promise.resolve(undefined),
  mutate: vi.fn(() => Promise.resolve()),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/events',
}))

import EventsPage from '@/app/(app)/events/page'
import { apiRequestHeaders } from '@/lib/api'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

const memberSession = {
  application: {
    id: 'application-eventiapp',
    code: 'eventiapp',
    name: 'EventiApp',
    product_label: 'Event operations',
    modules: ['home', 'events', 'metrics'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: { id: 'member', email: 'member@example.test', first_name: 'Ana', last_name: 'Miembro', is_root: false, root_level: 0 },
  organizations: [
    { id: 'org-a', name: 'Organización A', code: 'org-a', access_role: 'EDITOR', capabilities: ['events:view', 'events:manage'] },
    { id: 'org-b', name: 'Organización B', code: 'org-b', access_role: 'CHECKIN', capabilities: ['events:view', 'checkin:run'] },
  ],
  capabilities: ['events:view', 'events:manage', 'checkin:run'],
} as unknown as ApplicationSession

describe('EventiApp events page in the caller-access workspace', () => {
  beforeEach(() => {
    swr.keys = []
    useStore.getState().clearSession()
    useStore.getState().setToken('member-token')
    useStore.getState().setApplicationSession(memberSession)
    // What the layout decides for a non-admin member on EventiApp.
    useStore.getState().activateTenantWorkspace('eventiapp', { canUsePlatformMode: false, portfolio: true })
  })

  it('requests the first page of every reachable event without an organization', async () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <EventsPage />
      </ProductProvider>
    )

    const eventRequests = swr.keys.filter((key) => Array.isArray(key) && String(key[0]).startsWith('/events?'))
    expect(eventRequests[0]).toEqual(['/events?page=1&page_size=12&filter=all', 'eventiapp', 'organization', null])

    const headers = await apiRequestHeaders()
    expect(headers).toMatchObject({ 'X-Application-Code': 'eventiapp', 'X-Workspace-Mode': 'organization' })
    expect(headers).not.toHaveProperty('X-Organization-ID')
    expect(headers).not.toHaveProperty('X-Organization-Context')
  })
})
