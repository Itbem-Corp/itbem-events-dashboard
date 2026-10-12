import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issueOrganizationContext: vi.fn(),
  refreshApplicationSession: vi.fn(),
}))

vi.mock('swr', () => ({
  default: () => ({ data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: () => undefined }),
  preload: () => Promise.resolve(undefined),
  useSWRConfig: () => ({ cache: new Map() }),
  unstable_serialize: (key: unknown) => JSON.stringify(key),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/events',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/ui/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/ui/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/features/workspace/issue-organization-context', () => ({
  issueOrganizationContext: (organizationId: string) => mocks.issueOrganizationContext(organizationId),
}))
vi.mock('@/lib/api', () => ({
  SESSION_FOCUS_REVALIDATE_AFTER_MS: 0,
  SESSION_REVALIDATE_INTERVAL_MS: 300_000,
  getApplicationSession: () => Promise.resolve(undefined),
  refreshApplicationSession: (minAgeMs?: number) => mocks.refreshApplicationSession(minAgeMs),
}))

import { ApplicationLayout } from '@/components/application-layout'
import SessionBootstrap from '@/components/session/SessionBootstrap'
import { organizationContextRefreshDelay } from '@/features/workspace/use-organization-context-renewal'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

describe('organization context renewal', () => {
  it('renews forty-five seconds before expiration', () => {
    expect(organizationContextRefreshDelay(new Date(300_000).toISOString(), 0)).toBe(255_000)
  })

  it('renews immediately when missing, invalid, or already inside the safety window', () => {
    expect(organizationContextRefreshDelay(undefined, 0)).toBe(0)
    expect(organizationContextRefreshDelay('invalid', 0)).toBe(0)
    expect(organizationContextRefreshDelay(new Date(30_000).toISOString(), 0)).toBe(0)
  })
})

const organizationA = { id: 'org-a', name: 'Organización A', code: 'org-a', client_type: { code: 'CUSTOMER' } }

function eventiSession(role: string, capabilities: string[]): ApplicationSession {
  return {
    application: {
      id: 'application-eventiapp',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: { id: 'user-1', email: 'user@example.test', first_name: 'Ana', last_name: 'Prueba', is_root: false, root_level: 0 },
    organizations: [{ ...organizationA, access_role: role, capabilities }],
    capabilities,
  } as unknown as ApplicationSession
}

const owner = eventiSession('Owner', ['events:view', 'members:manage', 'metrics:view'])
const member = eventiSession('EDITOR', ['events:view', 'events:manage'])

function renderShell() {
  return render(
    createElement(ProductProvider, {
      product: getProductManifest('eventiapp'),
      children: [
        createElement(SessionBootstrap, { key: 'session' }),
        createElement(ApplicationLayout, {
          key: 'layout',
          tenant: tenantPresentationForHostname('dashboard.eventiapp.com.mx'),
          children: 'Contenido',
        }),
      ],
    })
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('organization context credential lifecycle', () => {
  beforeEach(() => {
    mocks.issueOrganizationContext.mockReset()
    mocks.issueOrganizationContext.mockImplementation((organizationId: string) =>
      Promise.resolve({ token: `token-${organizationId}`, organizationId, expiresAt: new Date(Date.now() + 300_000).toISOString() })
    )
    mocks.refreshApplicationSession.mockReset()
    useStore.getState().clearSession()
  })

  afterEach(() => {
    useStore.getState().clearSession()
  })

  function returningOwner(session: ApplicationSession) {
    // The session revalidation returns a new object with identical content.
    mocks.refreshApplicationSession.mockImplementation(async () => {
      const copy = structuredClone(session)
      useStore.getState().setToken('fresh-token')
      useStore.getState().setApplicationSession(copy)
      return copy
    })
    useStore.setState({
      applicationSession: session,
      user: session.user,
      profileLoaded: true,
      workspaceContexts: { eventiapp: { mode: 'organization', organization: organizationA } },
    })
  }

  it('issues one credential for two identical session objects', async () => {
    returningOwner(owner)

    renderShell()
    await flush()
    expect(useStore.getState().currentClient?.id).toBe('org-a')
    expect(useStore.getState().organizationContext?.organizationId).toBe('org-a')

    act(() => useStore.getState().setApplicationSession(structuredClone(owner)))
    await flush()

    // SessionBootstrap also revalidated once on mount (another identical copy).
    expect(mocks.refreshApplicationSession).toHaveBeenCalled()
    expect(mocks.issueOrganizationContext).toHaveBeenCalledTimes(1)
    expect(useStore.getState().organizationContext?.organizationId).toBe('org-a')
  })

  it('issues no credential after a visibilitychange revalidation', async () => {
    returningOwner(owner)

    renderShell()
    await flush()
    const issued = mocks.issueOrganizationContext.mock.calls.length
    const revalidations = mocks.refreshApplicationSession.mock.calls.length

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()

    expect(mocks.refreshApplicationSession.mock.calls.length).toBeGreaterThan(revalidations)
    expect(mocks.issueOrganizationContext.mock.calls.length).toBe(issued)
    expect(issued).toBe(1)
  })

  it('never issues a credential in the caller-access workspace', async () => {
    returningOwner(member)

    renderShell()
    await flush()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()

    expect(useStore.getState().workspacePortfolio).toBe(true)
    expect(useStore.getState().currentClient).toBeNull()
    expect(mocks.issueOrganizationContext).not.toHaveBeenCalled()
  })
})
