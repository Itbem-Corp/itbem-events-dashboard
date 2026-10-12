import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useSWRMock = vi.fn((_key: unknown, _fetcher: unknown, _options?: unknown) => ({
  data: undefined,
  error: undefined,
  isLoading: false,
}))
const preloadMock = vi.fn((_key: unknown, _fetcher: unknown) => Promise.resolve(undefined))
const routerPrefetchMock = vi.fn()
const routerReplaceMock = vi.fn()
const swrCache = new Map<string, { data?: unknown }>()

vi.mock('swr', () => ({
  default: (key: unknown, fetcher: unknown, options: unknown) => useSWRMock(key, fetcher, options),
  preload: (key: unknown, fetcher: unknown) => preloadMock(key, fetcher),
  useSWRConfig: () => ({ cache: swrCache }),
  unstable_serialize: (key: unknown) => JSON.stringify(key),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: routerReplaceMock, prefetch: routerPrefetchMock }),
}))
vi.mock('@/components/ui/notification-bell', () => ({ NotificationBell: () => <div>Centro de notificaciones</div> }))
vi.mock('@/components/ui/UserAvatar', () => ({ default: () => <span>Avatar</span> }))
vi.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => <div>Paleta global</div> }))
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => <button aria-label="Cambiar tema" /> }))
vi.mock('@/features/workspace/issue-organization-context', () => ({
  issueOrganizationContext: (organizationId: string) =>
    Promise.resolve({ token: 'context-token', organizationId, expiresAt: '2099-01-01T00:00:00.000Z' }),
}))

import { ApplicationLayout } from '@/components/application-layout'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import type { TenantCode } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

describe('ApplicationLayout client loading', () => {
  beforeEach(() => {
    useSWRMock.mockClear()
    preloadMock.mockClear()
    routerPrefetchMock.mockClear()
    swrCache.clear()
    useStore.setState({
      user: {
        id: 'root-1',
        email: 'root@example.com',
        first_name: 'Root',
        last_name: 'User',
        is_root: true,
      },
      currentClient: {
        id: 'client-1',
        name: 'Organización actual',
        code: 'current',
        client_type: { code: 'PLATFORM' },
      },
      profileLoaded: true,
    })
  })

  it('does not request organizations while rendering an unrelated route', () => {
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
    expect(screen.getAllByText('Organización actual').length).toBeGreaterThan(0)
  })

  it('requests organizations when the user opens the switcher', async () => {
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    fireEvent.pointerEnter(screen.getByRole('button', { name: /Organización actual/ }))
    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: true })
    )
  })

  it('loads organizations to bootstrap a non-root user without a current organization', () => {
    useStore.setState({
      user: {
        id: 'member-1',
        email: 'member@example.com',
        first_name: 'Member',
        last_name: 'User',
        is_root: false,
      },
      currentClient: null,
      profileLoaded: true,
    })

    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
  })

  it('loads organizations in parallel with the profile refresh for a persisted non-root user', () => {
    useStore.setState({
      user: {
        id: 'member-1',
        email: 'member@example.com',
        first_name: 'Member',
        last_name: 'User',
        is_root: false,
      },
      currentClient: null,
      profileLoaded: false,
    })

    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
  })

  it('starts organization bootstrap before a cold-login profile is available', () => {
    useStore.setState({ user: null, currentClient: null, profileLoaded: false })

    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
  })

  it('warms the route bundle and API cache when navigation intent is visible', () => {
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    const eventLinks = screen.getAllByRole('link', { name: 'Eventos' })
    fireEvent.pointerEnter(eventLinks[0])

    expect(routerPrefetchMock).toHaveBeenCalledWith('/events')
    expect(preloadMock).toHaveBeenCalledWith(
      ['/events?client_id=client-1&page=1&page_size=12&filter=all', 'eventiapp', 'organization', 'client-1'],
      expect.any(Function)
    )

    // EventiApp deliberately does not expose the ITBEM organization-management
    // route. Organization switching is warmed from its dedicated switcher.
    expect(screen.queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument()
  })

  it('does not mount global search until the user requests it', async () => {
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(screen.queryByText('Paleta global')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Buscar/ })[0])

    expect(await screen.findByText('Paleta global')).toBeInTheDocument()
  })

  it('does not refetch a cached destination on repeated navigation intent', () => {
    swrCache.set(
      JSON.stringify(['/events?client_id=client-1&page=1&page_size=12&filter=all', 'eventiapp', 'organization', 'client-1']),
      { data: { data: [] } }
    )
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    fireEvent.pointerEnter(screen.getAllByRole('link', { name: 'Eventos' })[0])

    expect(routerPrefetchMock).toHaveBeenCalledWith('/events')
    expect(preloadMock).not.toHaveBeenCalledWith(
      ['/events?client_id=client-1&page=1&page_size=12&filter=all', 'eventiapp', 'organization', 'client-1'],
      expect.any(Function)
    )
  })

  it('keeps notification UI unmounted until bell intent', async () => {
    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(screen.queryByText('Centro de notificaciones')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Notificaciones' })[0])

    expect((await screen.findAllByText('Centro de notificaciones')).length).toBeGreaterThan(0)
  })
})

describe('ApplicationLayout workspace source per product', () => {
  const eventiTenant = tenantPresentationForHostname('dashboard.eventiapp.com.mx')
  const cafettonTenant = tenantPresentationForHostname('dashboard.cafettonhouse.com')

  function organization(id: string, role: string, capabilities: string[]): ApplicationOrganization {
    return { id, name: `Organización ${id}`, code: id, access_role: role, capabilities }
  }

  function applicationSession(code: TenantCode, overrides: Partial<ApplicationSession>): ApplicationSession {
    return {
      application: {
        id: `application-${code}`,
        code,
        name: code,
        product_label: 'Operations',
        modules: code === 'eventiapp' ? ['home', 'events', 'metrics'] : ['home', 'users', 'organizations', 'metrics'],
        allows_platform_admin: code !== 'cafettonhouse',
        is_active: true,
      },
      user: { id: 'member-1', email: 'member@example.test', first_name: 'Ana', last_name: 'Miembro', is_root: false, root_level: 0 },
      organizations: [],
      capabilities: [],
      ...overrides,
    } as ApplicationSession
  }

  // GET /clients answers with signed logos and may include organizations the
  // session cannot select (another product, or a child organization).
  const clientsPayload = {
    data: [
      { id: 'org-other-product', name: 'Otra marca', code: 'otra', logo: 'https://cdn.example/otra.png?signature=1', access_role: 'OWNER', client_type: { code: 'CUSTOMER' } },
      { id: 'org-a', name: 'Organización A', code: 'org-a', logo: 'https://cdn.example/logo-a.png?signature=1', access_role: 'Owner', client_type: { code: 'CUSTOMER' } },
      { id: 'org-b', name: 'Organización B', code: 'org-b', logo: 'https://cdn.example/logo-b.png?signature=1', access_role: 'EDITOR', client_type: { code: 'CUSTOMER' } },
    ],
    total: 3,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }

  function respondWithClients() {
    useSWRMock.mockImplementation(
      (key: unknown) =>
        ({
          data: typeof key === 'string' && key.startsWith('/clients') ? { status: 200, message: 'OK', data: clientsPayload } : undefined,
          error: undefined,
          isLoading: false,
        }) as unknown as ReturnType<typeof useSWRMock>
    )
  }

  function clientRequests() {
    return useSWRMock.mock.calls.filter(([key]) => typeof key === 'string' && key.startsWith('/clients'))
  }

  beforeEach(() => {
    useStore.getState().clearSession()
    useSWRMock.mockClear()
    respondWithClients()
  })

  afterEach(() => {
    useSWRMock.mockImplementation(() => ({ data: undefined, error: undefined, isLoading: false }))
  })

  it('never requests organizations for an EventiApp member in the caller-access workspace', () => {
    const session = applicationSession('eventiapp', {
      organizations: [organization('org-a', 'EDITOR', ['events:view']), organization('org-b', 'CHECKIN', ['events:view'])],
      capabilities: ['events:view'],
    })
    useStore.setState({
      applicationSession: session,
      user: session.user,
      profileLoaded: true,
      // A persisted organization from an earlier visit must not be restored.
      workspaceContexts: {
        eventiapp: { mode: 'organization', organization: { id: 'org-a', name: 'A', code: 'org-a', client_type: { code: 'CUSTOMER' } } },
      },
    })

    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    expect(clientRequests()).toEqual([])
    expect(useStore.getState().currentClient).toBeNull()
    expect(useStore.getState().workspacePortfolio).toBe(true)
    expect(screen.queryByText('Espacio de trabajo')).not.toBeInTheDocument()
  })

  it('does not request organizations before the session arrives on EventiApp', () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    expect(clientRequests()).toEqual([])
  })

  it('loads organizations for an EventiApp Owner and keeps only the session organizations', async () => {
    const session = applicationSession('eventiapp', {
      organizations: [
        organization('org-a', 'Owner', ['events:view', 'members:manage', 'metrics:view']),
        organization('org-b', 'EDITOR', ['events:view']),
      ],
      capabilities: ['events:view', 'members:manage', 'metrics:view'],
    })
    useStore.setState({ applicationSession: session, user: session.user, profileLoaded: true })

    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    expect(clientRequests().at(-1)?.[0]).toBe('/clients?page=1&page_size=50')
    // The bootstrap selects a session organization, never the other product's.
    await waitFor(() => expect(useStore.getState().currentClient?.id).toBe('org-a'))

    const trigger = screen.getByRole('button', { name: /Organización A/ })
    fireEvent.pointerEnter(trigger)
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Otra marca')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Organización B')).toBeInTheDocument()
    expect(within(dialog).getByText('2 de 2')).toBeInTheDocument()
    expect(within(dialog).getByText(/· Propietario/)).toBeInTheDocument()
    const logos = Array.from(dialog.querySelectorAll('img')).map((image) => decodeURIComponent(image.getAttribute('src') ?? ''))
    expect(logos.some((src) => src.includes('https://cdn.example/logo-a.png?signature=1'))).toBe(true)
    expect(logos.some((src) => src.includes('otra.png'))).toBe(false)
  })

  it('keeps an inherited child organization selected even when the list page omits it', async () => {
    const session = applicationSession('eventiapp', {
      organizations: [
        organization('org-a', 'Owner', ['events:view', 'members:manage']),
        organization('child-org', 'INHERITED_OWNER', ['events:view', 'members:manage']),
      ],
      capabilities: ['events:view', 'members:manage'],
    })
    const child = { id: 'child-org', name: 'Organización hija', code: 'child-org', client_type: { code: 'CUSTOMER' } }
    useStore.setState({
      applicationSession: session,
      user: session.user,
      profileLoaded: true,
      currentClient: child,
      workspaceMode: 'organization',
      workspaceContexts: { eventiapp: { mode: 'organization', organization: child } },
    })

    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    // Opening the switcher loads a list page that does not include the child.
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Organización hija/ }))
    await waitFor(() => expect(clientRequests().length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useStore.getState().currentClient?.id).toBe('child-org')
  })

  it('keeps the Cafetton House organization list and request exactly as today', async () => {
    const session = applicationSession('cafettonhouse', {
      organizations: [organization('org-a', 'MEMBER', ['organizations:view']), organization('org-b', 'MEMBER', ['organizations:view'])],
      capabilities: ['organizations:view'],
    })
    useStore.setState({ applicationSession: session, user: session.user, profileLoaded: true })

    render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <ApplicationLayout tenant={cafettonTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    expect(clientRequests().at(-1)?.[0]).toBe('/clients?page=1&page_size=50')
    await waitFor(() => expect(useStore.getState().currentClient?.id).toBe('org-other-product'))

    const trigger = screen.getByRole('button', { name: /Otra marca/ })
    fireEvent.pointerEnter(trigger)
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Organización B')).toBeInTheDocument()
    expect(within(dialog).getByText('3 de 3')).toBeInTheDocument()
    // Raw role codes, as today.
    expect(within(dialog).getByText(/· Owner/)).toBeInTheDocument()
  })
})

describe('ApplicationLayout assigned-events workspace for organization admins', () => {
  const eventiTenant = tenantPresentationForHostname('dashboard.eventiapp.com.mx')

  function adminWithGrants(withGrants: boolean): ApplicationSession {
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
      user: { id: 'admin-1', email: 'admin@example.test', first_name: 'Ana', last_name: 'Admin', is_root: false, root_level: 0 },
      organizations: [
        { id: 'org-a', name: 'Organización A', code: 'org-a', access_role: 'ADMIN', capabilities: ['events:view', 'members:manage', 'metrics:view'] },
      ],
      capabilities: ['events:view', 'members:manage', 'metrics:view'],
      ...(withGrants ? { event_access: { assigned_events: 2, capabilities: ['events:view', 'guests:manage'] } } : {}),
    } as unknown as ApplicationSession
  }

  beforeEach(() => {
    useStore.getState().clearSession()
    useSWRMock.mockClear()
  })

  it('offers "Eventos asignados" to an admin with event grants, even with one organization', async () => {
    const session = adminWithGrants(true)
    useStore.setState({
      applicationSession: session,
      user: session.user,
      profileLoaded: true,
      workspaceContexts: {
        eventiapp: { mode: 'organization', organization: { id: 'org-a', name: 'Organización A', code: 'org-a', client_type: { code: 'CUSTOMER' } } },
      },
    })

    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    await waitFor(() => expect(useStore.getState().currentClient?.id).toBe('org-a'))
    const trigger = screen.getByRole('button', { name: /Organización A/ })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Eventos asignados/ }))

    await waitFor(() => expect(useStore.getState().workspacePortfolio).toBe(true))
    expect(useStore.getState().currentClient).toBeNull()
    expect(useStore.getState().organizationContext).toBeNull()
    // Straight to the event list: Inicio is not part of that workspace.
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/events'))
  })

  it('keeps the single-organization card for an admin without grants', () => {
    const session = adminWithGrants(false)
    useStore.setState({ applicationSession: session, user: session.user, profileLoaded: true })

    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <ApplicationLayout tenant={eventiTenant}>Contenido</ApplicationLayout>
      </ProductProvider>
    )

    expect(screen.getByText('Organización asignada')).toBeInTheDocument()
  })
})
