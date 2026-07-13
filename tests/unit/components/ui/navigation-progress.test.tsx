import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/events' }))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}))

vi.mock('next/link', async () => {
  const React = await import('react')

  type NavigateEvent = { preventDefault: () => void }
  type MockLinkProps = React.ComponentPropsWithoutRef<'a'> & {
    onNavigate?: (event: NavigateEvent) => void
  }

  const MockNextLink = React.forwardRef<HTMLAnchorElement, MockLinkProps>(({ onClick, onNavigate, ...props }, ref) => (
    <a
      {...props}
      ref={ref}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        onNavigate?.({ preventDefault: () => event.preventDefault() })
      }}
    />
  ))

  MockNextLink.displayName = 'MockNextLink'
  return { default: MockNextLink }
})

vi.mock('@headlessui/react', () => ({
  DataInteractive: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('NavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigation.pathname = '/events'
    window.history.replaceState({}, '', '/events')
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not flash for navigation completed before the display threshold', async () => {
    const { NavigationProgress } = await import('@/components/ui/navigation-progress')
    const { beginNavigationProgress } = await import('@/lib/navigation-progress')
    const { container, rerender } = render(<NavigationProgress />)
    const bar = container.querySelector('[data-navigation-progress]')

    act(() => beginNavigationProgress())
    expect(bar).toHaveAttribute('data-state', 'waiting')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    navigation.pathname = '/clients'
    window.history.pushState({}, '', '/clients')
    rerender(<NavigationProgress />)

    act(() => vi.advanceTimersByTime(200))
    expect(bar).toHaveAttribute('data-state', 'idle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows accessible progress and completes smoothly for a slower route', async () => {
    const { NavigationProgress } = await import('@/components/ui/navigation-progress')
    const { beginNavigationProgress } = await import('@/lib/navigation-progress')
    const { container, rerender } = render(<NavigationProgress />)
    const bar = container.querySelector('[data-navigation-progress]')

    act(() => beginNavigationProgress())
    act(() => vi.advanceTimersByTime(125))

    expect(bar).toHaveAttribute('data-state', 'loading')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando nueva vista')

    navigation.pathname = '/clients'
    window.history.pushState({}, '', '/clients')
    rerender(<NavigationProgress />)

    expect(bar).toHaveAttribute('data-state', 'finishing')
    expect(bar?.firstElementChild).toHaveStyle({ transform: 'scaleX(1)' })

    act(() => vi.advanceTimersByTime(181))
    expect(bar).toHaveAttribute('data-state', 'idle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('starts from the shared Link and respects cancelled navigation', async () => {
    const { NavigationProgress } = await import('@/components/ui/navigation-progress')
    const { Link } = await import('@/components/link')
    const { container, rerender } = render(
      <>
        <NavigationProgress />
        <Link href="/clients">Clientes</Link>
      </>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Clientes' }))
    expect(container.querySelector('[data-navigation-progress]')).toHaveAttribute('data-state', 'waiting')

    navigation.pathname = '/clients'
    window.history.pushState({}, '', '/clients')
    rerender(
      <>
        <NavigationProgress />
        <Link href="/events" onNavigate={(event) => event.preventDefault()}>
          Eventos
        </Link>
      </>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Eventos' }))
    expect(container.querySelector('[data-navigation-progress]')).toHaveAttribute('data-state', 'idle')

    rerender(
      <>
        <NavigationProgress />
        <Link href="/clients">Clientes actuales</Link>
      </>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Clientes actuales' }))
    expect(container.querySelector('[data-navigation-progress]')).toHaveAttribute('data-state', 'idle')
  })

  it('moves focus to the new main content without changing scroll position', async () => {
    const { NavigationProgress } = await import('@/components/ui/navigation-progress')
    const { rerender } = render(
      <>
        <NavigationProgress />
        <main id="dashboard-main" tabIndex={-1}>Eventos</main>
      </>
    )

    navigation.pathname = '/clients'
    window.history.pushState({}, '', '/clients')
    rerender(
      <>
        <NavigationProgress />
        <main id="dashboard-main" tabIndex={-1}>Clientes</main>
      </>
    )
    act(() => vi.advanceTimersByTime(20))

    expect(document.activeElement).toBe(screen.getByRole('main'))
  })
})
