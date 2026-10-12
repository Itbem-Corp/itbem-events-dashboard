import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
import type { TenantCode } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigationState = vi.hoisted(() => ({ pathname: '/audit' }))
const replaceMock = vi.hoisted(() => vi.fn())
const fetcherMock = vi.hoisted(() => vi.fn((_key: unknown) => new Promise(() => undefined)))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/application-layout', () => ({
  ApplicationLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="application-layout">{children}</div>,
}))
vi.mock('@/components/session/SessionBootstrap', () => ({ default: () => null }))
vi.mock('@/components/ui/navigation-progress', () => ({ NavigationProgress: () => null }))
vi.mock('@/components/ui/connection-status-banner', () => ({ ConnectionStatusBanner: () => null }))
vi.mock('@/hooks/useStoreHydration', () => ({ useStoreHydration: () => true }))
vi.mock('@/lib/fetcher', () => ({ fetcher: (key: unknown) => fetcherMock(key) }))

import { AppLayoutClient } from '@/app/(app)/app-layout-client'
import AuditPage from '@/app/(app)/audit/page'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { useStore } from '@/store/useStore'

const HOSTS: Record<TenantCode, string> = {
  eventiapp: 'dashboard.eventiapp.com.mx',
  itbem: 'dashboard.itbem.com.mx',
  cafettonhouse: 'dashboard.cafettonhouse.com',
}

function membership(role: string, capabilities: string[]): ApplicationOrganization {
  return { id: 'org-1', name: 'Organización Uno', code: 'org-1', access_role: role, capabilities }
}

function session(code: TenantCode, overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  return {
    application: {
      id: `application-${code}`,
      code,
      name: code,
      product_label: 'Operations',
      modules: [...getProductManifest(code).backendModules],
      allows_platform_admin: code !== 'cafettonhouse',
      is_active: true,
    },
    user: { id: 'user-1', email: 'user@example.test', first_name: 'Persona', last_name: 'Prueba', is_root: false, root_level: 0 },
    organizations: [],
    capabilities: [],
    ...overrides,
  } as ApplicationSession
}

const eventManager = session('eventiapp', {
  organizations: [membership('EVENT_MANAGER', ['events:view', 'events:create', 'events:manage'])],
  capabilities: ['events:view', 'events:create', 'events:manage'],
})

const rootOne = session('eventiapp', {
  user: { id: 'root-1', email: 'root@example.test', first_name: 'Root', last_name: 'Uno', is_root: true, root_level: 1 } as ApplicationSession['user'],
  capabilities: ['events:view', 'metrics:view', 'audit:view', 'platform:users:view'],
})

function renderShell(code: TenantCode, pathname: string) {
  navigationState.pathname = pathname
  const tenant = tenantPresentationForHostname(HOSTS[code])
  return render(
    <AppLayoutClient product={getProductManifest(code)} tenant={tenant}>
      {pathname === '/audit' ? <AuditPage /> : <p>Contenido de la ruta</p>}
    </AppLayoutClient>
  )
}

describe('AppLayoutClient route guard', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    fetcherMock.mockClear()
    useStore.getState().clearSession()
  })

  it('holds EventiApp /audit behind a skeleton for a non-root and never loads audit data', async () => {
    useStore.setState({ applicationSession: eventManager, user: eventManager.user, profileLoaded: true })

    renderShell('eventiapp', '/audit')

    expect(screen.getByRole('status', { name: 'Verificando acceso' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Auditoría' })).not.toBeInTheDocument()
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/events'))
    expect(fetcherMock).not.toHaveBeenCalled()
  })

  it('keeps the skeleton when the profile is loaded without an application session', async () => {
    useStore.setState({ applicationSession: null, user: eventManager.user, profileLoaded: true })

    renderShell('eventiapp', '/audit')

    expect(screen.getByRole('status', { name: 'Verificando acceso' })).toBeInTheDocument()
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(fetcherMock).not.toHaveBeenCalled()
  })

  it('keeps the skeleton while the profile is still loading', () => {
    renderShell('eventiapp', '/audit')

    expect(screen.getByRole('status', { name: 'Verificando acceso' })).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
    expect(fetcherMock).not.toHaveBeenCalled()
  })

  it('renders the audit page for Root 1', async () => {
    useStore.setState({ applicationSession: rootOne, user: rootOne.user, profileLoaded: true, workspaceMode: 'platform' })

    renderShell('eventiapp', '/audit')

    expect(await screen.findByRole('heading', { name: 'Auditoría' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Verificando acceso' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetcherMock).toHaveBeenCalled())
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('sends an EventiApp member from home to the event list without rendering home', async () => {
    useStore.setState({ applicationSession: eventManager, user: eventManager.user, profileLoaded: true })

    renderShell('eventiapp', '/')

    expect(screen.getByRole('status', { name: 'Verificando acceso' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido de la ruta')).not.toBeInTheDocument()
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/events'))
  })

  it('renders EventiApp event routes without a skeleton for members', () => {
    useStore.setState({ applicationSession: eventManager, user: eventManager.user, profileLoaded: true })

    renderShell('eventiapp', '/events')

    expect(screen.getByText('Contenido de la ruta')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('renders Cafetton House /metrics as today: no skeleton, then the same redirect', async () => {
    const member = session('cafettonhouse', {
      organizations: [membership('MEMBER', ['organizations:view'])],
      capabilities: ['organizations:view'],
    })
    useStore.setState({ applicationSession: member, user: member.user, profileLoaded: true })

    renderShell('cafettonhouse', '/metrics')

    expect(screen.getByText('Contenido de la ruta')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Verificando acceso' })).not.toBeInTheDocument()
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  it('renders Cafetton House routes while the profile loads, as today', () => {
    renderShell('cafettonhouse', '/team')

    expect(screen.getByText('Contenido de la ruta')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Verificando acceso' })).not.toBeInTheDocument()
  })
})
