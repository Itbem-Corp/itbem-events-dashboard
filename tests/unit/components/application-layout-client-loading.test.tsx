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
vi.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => <button aria-label="Cambiar tema" /> }))

import { ApplicationLayout } from '@/components/application-layout'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
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
