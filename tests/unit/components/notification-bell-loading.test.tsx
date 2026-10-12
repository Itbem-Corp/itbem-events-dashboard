import { NotificationBell } from '@/components/ui/notification-bell'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swrState = {
  data: undefined as unknown,
  error: undefined as Error | undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
}
const useSWRMock = vi.fn((_key: unknown) => swrState)
const preloadMock = vi.fn((_key: unknown, _fetcher: unknown) => Promise.resolve())
const prefetchMock = vi.fn()

vi.mock('swr', () => ({
  default: (key: unknown) => useSWRMock(key),
  preload: (key: unknown, fetcher: unknown) => preloadMock(key, fetcher),
  mutate: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: prefetchMock }) }))

describe('NotificationBell loading', () => {
  beforeEach(() => {
    useSWRMock.mockClear()
    preloadMock.mockClear()
    prefetchMock.mockClear()
    swrState.data = undefined
    swrState.error = undefined
    swrState.isLoading = false
    swrState.isValidating = false
    swrState.mutate.mockClear()
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
        name: 'Cliente Uno',
        code: 'CLIENT-1',
        client_type: { code: 'CUSTOMER' },
      },
      profileLoaded: true,
    })
  })

  it('keeps event data idle until the user shows intent', () => {
    render(<NotificationBell />)

    expect(useSWRMock).toHaveBeenLastCalledWith(null)

    fireEvent.focus(screen.getByRole('button', { name: 'Notificaciones' }))

    expect(useSWRMock).toHaveBeenLastCalledWith([
      '/events/notifications?client_id=client-1',
      'eventiapp',
      'organization',
      'client-1',
    ])
  })

  it('shows a stable loading state instead of a false empty state', () => {
    swrState.isLoading = true
    render(<NotificationBell />)

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))

    expect(screen.getByRole('status', { name: 'Cargando notificaciones' })).toBeInTheDocument()
    expect(screen.queryByText('Sin notificaciones activas')).not.toBeInTheDocument()
  })

  it('offers an in-place retry when notifications fail', () => {
    swrState.error = new Error('offline')
    render(<NotificationBell />)

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus notificaciones')
    expect(swrState.mutate).toHaveBeenCalledOnce()
  })
})

describe('NotificationBell sizing per product shell', () => {
  function eventsToday(count: number) {
    const now = new Date().toISOString()
    return Array.from({ length: count }, (_, index) => ({
      id: `event-${index}`,
      name: `Evento ${index}`,
      identifier: `evento-${index}`,
      is_active: true,
      event_date_time: now,
      timezone: 'UTC',
    }))
  }

  beforeEach(() => {
    swrState.data = undefined
    swrState.error = undefined
    swrState.isLoading = false
  })

  it('fits a two-digit count at 12px with a 44px button on EventiApp', () => {
    swrState.data = eventsToday(99)
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <NotificationBell />
      </ProductProvider>
    )

    const button = screen.getByRole('button', { name: 'Notificaciones' })
    expect(button).toHaveClass('size-11', 'lg:size-9')
    expect(button.className).not.toMatch(/(^|\s)size-8(\s|$)/)
    const badge = screen.getByTestId('notification-count')
    expect(badge).toHaveTextContent('99')
    expect(badge).toHaveClass('h-5', 'min-w-5', 'px-1', 'text-xs')
    expect(badge.className).not.toContain('text-[9px]')
  })

  it('caps the EventiApp badge above two digits', () => {
    swrState.data = eventsToday(120)
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <NotificationBell />
      </ProductProvider>
    )

    expect(screen.getByTestId('notification-count')).toHaveTextContent('99+')
  })

  it('keeps the Cafetton House bell and badge as before', () => {
    swrState.data = eventsToday(12)
    render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <NotificationBell />
      </ProductProvider>
    )

    const button = screen.getByRole('button', { name: 'Notificaciones' })
    expect(button).toHaveClass('size-8')
    expect(button.className).not.toContain('size-11')
    const badge = button.querySelector('span')
    expect(badge).toHaveTextContent('9+')
    expect(badge).toHaveClass('size-4', 'text-[9px]')
  })
})
