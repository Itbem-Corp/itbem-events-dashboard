import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSWRMock = vi.fn((_key: unknown, _fetcher: unknown, _options?: unknown) => ({
  data: undefined,
  error: undefined,
  isLoading: false,
}))
const preloadMock = vi.fn((_key: unknown, _fetcher: unknown) => Promise.resolve(undefined))
const routerPrefetchMock = vi.fn()
const swrCache = new Map<string, { data?: unknown }>()

vi.mock('swr', () => ({
  default: (key: unknown, fetcher: unknown, options: unknown) => useSWRMock(key, fetcher, options),
  preload: (key: unknown, fetcher: unknown) => preloadMock(key, fetcher),
  useSWRConfig: () => ({ cache: swrCache }),
  unstable_serialize: (key: unknown) => JSON.stringify(key),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), prefetch: routerPrefetchMock }),
}))
vi.mock('@/components/ui/notification-bell', () => ({ NotificationBell: () => <div>Centro de notificaciones</div> }))
vi.mock('@/components/ui/UserAvatar', () => ({ default: () => <span>Avatar</span> }))
vi.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => <div>Paleta global</div> }))
vi.mock('@/features/workspace/use-organization-context-renewal', () => ({ useOrganizationContextRenewal: () => undefined }))
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => <button aria-label="Cambiar tema" /> }))

import { ApplicationLayout } from '@/components/application-layout'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { useStore } from '@/store/useStore'
import type { ApplicationSession } from '@/models/ApplicationSession'

function sessionWith(capabilities: string[], options: { root?: boolean } = {}): ApplicationSession {
  return {
    application: {
      id: 'app',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'EventiApp',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: { id: 'user-1', email: 'user@example.com', is_root: Boolean(options.root) },
    organizations: [
      { id: 'org-session', name: 'Organización de la sesión', code: 'session-org', capabilities },
    ],
    capabilities,
  } as unknown as ApplicationSession
}

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
      applicationSession: null,
      workspaceContexts: {},
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
    const session = sessionWith(['organizations:view', 'events:view'])
    session.organizations.push({ id: 'client-1', name: 'Organización actual', code: 'current', capabilities: ['events:view'] } as never)
    useStore.setState({
      applicationSession: session,
      workspaceContexts: { eventiapp: { mode: 'organization', organization: useStore.getState().currentClient } },
    })
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
      applicationSession: sessionWith(['events:manage', 'events:view']),
    })

    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
  })

  it('waits for the verified session before asking for the organization list', () => {
    useStore.setState({ user: null, currentClient: null, profileLoaded: false, applicationSession: null })

    const { rerender } = render(<ApplicationLayout>Contenido</ApplicationLayout>)

    // The list request would wait for the same token/session call anyway;
    // deciding first avoids a 403 for roles that cannot read the list.
    expect(useSWRMock).toHaveBeenLastCalledWith(null, expect.any(Function), expect.anything())

    useStore.setState({ applicationSession: sessionWith(['events:manage', 'events:view']), profileLoaded: true })
    rerender(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock).toHaveBeenLastCalledWith(
      '/clients?page=1&page_size=50',
      expect.any(Function),
      expect.objectContaining({ ...responsiveListSwrOptions, keepPreviousData: true })
    )
  })

  it('never calls the organization list for roles without access and uses the session organizations', () => {
    useStore.setState({
      user: { id: 'checkin-1', email: 'checkin@example.com', first_name: 'Check', last_name: 'In', is_root: false },
      currentClient: null,
      profileLoaded: true,
      applicationSession: sessionWith(['events:view', 'checkin:run']),
    })

    render(<ApplicationLayout>Contenido</ApplicationLayout>)

    expect(useSWRMock.mock.calls.some(([key]) => typeof key === 'string' && key.startsWith('/clients'))).toBe(false)
    expect(useStore.getState().currentClient).toMatchObject({ id: 'org-session', name: 'Organización de la sesión' })
  })

  it('keeps an inherited child organization selected even when the list page omits it', () => {
    const session = sessionWith(['events:manage', 'events:view'])
    session.organizations.push({
      id: 'child-org',
      name: 'Organización hija',
      code: 'child',
      access_role: 'INHERITED_OWNER',
      capabilities: ['events:manage', 'events:view'],
    } as never)
    const child = { id: 'child-org', name: 'Organización hija', code: 'child', client_type: { code: '' } }
    useStore.setState({
      user: { id: 'owner-1', email: 'owner@example.com', first_name: 'Owner', last_name: 'User', is_root: false },
      applicationSession: session,
      currentClient: child,
      workspaceMode: 'organization',
      workspaceContexts: { eventiapp: { mode: 'organization', organization: child } },
    })
    useSWRMock.mockReturnValue({
      data: { data: [{ id: 'org-session', name: 'Organización de la sesión', code: 'session-org' }], total: 1 },
      error: undefined,
      isLoading: false,
    } as never)

    try {
      render(<ApplicationLayout>Contenido</ApplicationLayout>)
      expect(useStore.getState().currentClient?.id).toBe('child-org')
    } finally {
      useSWRMock.mockReset()
      useSWRMock.mockImplementation(() => ({ data: undefined, error: undefined, isLoading: false }))
    }
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
