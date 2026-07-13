import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  prefetch: vi.fn(),
  preload: vi.fn(() => Promise.resolve()),
  beginNavigationProgress: vi.fn(),
  useSWR: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    prefetch: mocks.prefetch,
  }),
}))

vi.mock('swr', () => ({
  default: mocks.useSWR,
  preload: mocks.preload,
  mutate: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/navigation-progress', () => ({
  beginNavigationProgress: mocks.beginNavigationProgress,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }) => <div {...props}>{children}</div>,
  },
}))

function swrValue(data: unknown) {
  return {
    data,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key?.startsWith('/events?')) {
        return swrValue({
          data: [
            {
              id: 'event-1',
              name: 'Cena Demo',
              identifier: 'cena-demo',
              is_active: true,
              event_date_time: '2026-08-15T20:00:00-06:00',
              timezone: 'America/Mexico_City',
              event_type_id: 'type-1',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 6,
          total_pages: 1,
          counts: { all: 1, upcoming: 1, today: 0, past: 0 },
        })
      }

      if (key?.startsWith('/users/all?')) {
        return swrValue({
          data: [
            {
              id: 'user-1',
              email: 'ana@example.com',
              first_name: 'Ana',
              last_name: 'Garcia',
              is_active: true,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 4,
          total_pages: 1,
        })
      }

      return swrValue(undefined)
    })
  })

  it('renders users from the paginated /users/all payload', async () => {
    const { CommandPalette } = await import('@/components/ui/command-palette')
    const user = userEvent.setup()

    render(<CommandPalette open onClose={vi.fn()} isRoot />)

    await user.type(screen.getByPlaceholderText(/buscar eventos/i), 'ana')

    expect(await screen.findByText('Ana Garcia')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(mocks.useSWR).toHaveBeenCalledWith(
      '/users/all?page=1&page_size=4&search=ana',
      expect.any(Function),
      expect.any(Object)
    )
  })

  it('does not request or expose root-only users for regular accounts', async () => {
    const { CommandPalette } = await import('@/components/ui/command-palette')

    render(<CommandPalette open onClose={vi.fn()} />)

    expect(mocks.useSWR).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Object))
    expect(screen.queryByText('Ir a Usuarios')).not.toBeInTheDocument()
  })

  it('scopes event search to the selected organization', async () => {
    const { CommandPalette } = await import('@/components/ui/command-palette')

    render(<CommandPalette open onClose={vi.fn()} isRoot clientId="client-1" />)

    expect(mocks.useSWR).toHaveBeenCalledWith(
      '/events?client_id=client-1&page=1&page_size=6&filter=all',
      expect.any(Function),
      expect.any(Object)
    )
  })

  it('starts shared progress before imperative result navigation', async () => {
    const { CommandPalette } = await import('@/components/ui/command-palette')
    const user = userEvent.setup()

    render(<CommandPalette open onClose={vi.fn()} isRoot />)
    await user.click(await screen.findByText('Cena Demo'))

    expect(mocks.beginNavigationProgress).toHaveBeenCalledOnce()
    expect(mocks.beginNavigationProgress.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0])
    expect(mocks.push).toHaveBeenCalledWith('/events/event-1')
  })
})
