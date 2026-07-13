/**
 * event-analytics-panel.test.tsx
 * Unit tests for EventAnalyticsPanel — KPI cards, RSVP funnel,
 * role chart, dietary chart visibility, and moment uploads.
 */

import { EVENT_LIVE_REFRESH_INTERVAL_MS } from '@/lib/event-live-refresh'
import type { EventAnalytics } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('swr', () => ({
  default: vi.fn(),
}))
vi.mock('@/hooks/usePageActivity', () => ({
  usePageActivity: vi.fn(() => true),
}))

// Recharts doesn't render in happy-dom (no real canvas/SVG layout).
// Replace with lightweight stubs that still render their children/data.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: () => null,
  Legend: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const makeGuest = (overrides: Partial<Guest> = {}): Guest =>
  ({
    id: 'guest-001',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@example.com',
    rsvp_status: 'confirmed',
    role: 'guest',
    event_id: 'evt-001',
    dietary_restrictions: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as Guest

const makeAnalytics = (overrides: Partial<EventAnalytics> = {}): EventAnalytics =>
  ({
    event_id: 'evt-001',
    views: 42,
    rsvp_confirmed: 8,
    rsvp_declined: 2,
    moment_uploads: 0,
    guests: {
      total_guests: 1, confirmed: 1, declined: 0, pending: 0, total_companions: 0, estimated_attendees: 1,
      dietary: [{ name: 'Ninguna', value: 1 }], methods: [], roles: [{ name: 'guest', value: 1 }],
      tables: [], timeline: [], top_companions: [],
    },
    ...overrides,
  }) as EventAnalytics

// ── Helpers ───────────────────────────────────────────────────────────────────

import { usePageActivity } from '@/hooks/usePageActivity'
import useSWR from 'swr'

beforeEach(() => {
  vi.mocked(usePageActivity).mockReturnValue(true)
})

function mockSWRSequence(analytics: EventAnalytics | undefined, _guests: Guest[]) {
  vi.mocked(useSWR).mockReturnValue({
      data: analytics,
      isLoading: false,
      error: undefined,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSWR>)
}

function mockSWRLoading() {
  vi.mocked(useSWR).mockReturnValue({
    data: undefined,
    isLoading: true,
    error: undefined,
    isValidating: true,
    mutate: vi.fn(),
  } as ReturnType<typeof useSWR>)
}

async function renderPanel(analytics?: EventAnalytics, guests: Guest[] = []) {
  mockSWRSequence(analytics, guests)
  const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
  render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" guests={guests} />)
}

/**
 * Helper: find KPI card by its uppercase label and return the value text.
 * KPI labels use class "text-xs text-zinc-500 uppercase tracking-wide".
 */
function getKPIValue(label: string): string {
  const allLabels = screen.getAllByText(label)
  // Pick the one inside a KPI card (has the uppercase tracking-wide class)
  const kpiLabel = allLabels.find((el) => el.classList.contains('uppercase')) ?? allLabels[0]
  const card = kpiLabel.closest('div[class*="rounded-xl"]')!
  const valueEl = card.querySelector('p[class*="text-2xl"]')
  return valueEl?.textContent?.trim() ?? ''
}

describe('EventAnalyticsPanel live refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes the composed analytics contract with one request', async () => {
    await renderPanel(makeAnalytics(), [makeGuest()])

    const calls = vi.mocked(useSWR).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][2]).toMatchObject({ revalidateOnFocus: true, refreshInterval: EVENT_LIVE_REFRESH_INTERVAL_MS })
  })

  it('uses provided guests without requesting the event guest list again', async () => {
    mockSWRSequence(makeAnalytics(), [])
    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(
      <EventAnalyticsPanel
        eventId="evt-001"
        eventIdentifier="test-event"
        guests={[makeGuest({ id: 'provided-guest', rsvp_status: 'confirmed' })]}
      />
    )

    expect(vi.mocked(useSWR).mock.calls).toHaveLength(1)
    expect(getKPIValue('Confirmados')).toBe('1')
  })

  it('pauses every analytics poll while the page is not focused', async () => {
    vi.mocked(usePageActivity).mockReturnValue(false)
    await renderPanel(makeAnalytics(), [makeGuest()])

    for (const call of vi.mocked(useSWR).mock.calls) {
      expect(call[2]).toMatchObject({ refreshInterval: 0 })
    }
  })

  it('does not poll analytics for a past or inactive event', async () => {
    mockSWRSequence(makeAnalytics(), [makeGuest()])
    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" liveRefreshEnabled={false} />)

    for (const call of vi.mocked(useSWR).mock.calls) {
      expect(call[2]).toMatchObject({ refreshInterval: 0 })
    }
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EventAnalyticsPanel — loading state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders skeleton while loading', async () => {
    mockSWRLoading()
    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)
    const animatedEl = document.querySelector('.animate-pulse')
    expect(animatedEl).toBeInTheDocument()
  })
})

describe('EventAnalyticsPanel — recovery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers an in-place retry when analytics never loaded', async () => {
    const retryAnalytics = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSWR).mockReturnValue({
        data: undefined,
        isLoading: false,
        isValidating: false,
        error: new Error('offline'),
        mutate: retryAnalytics,
      } as ReturnType<typeof useSWR>)

    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(retryAnalytics).toHaveBeenCalledOnce())
  })

  it('keeps cached metrics visible when only background refresh fails', async () => {
    vi.mocked(useSWR).mockReturnValue({
        data: makeAnalytics({ views: 42 }),
        isLoading: false,
        isValidating: false,
        error: new Error('refresh failed'),
        mutate: vi.fn(),
      } as ReturnType<typeof useSWR>)

    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)

    expect(screen.getByText('Mostrando la última información disponible; no pudimos completar la actualización.')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar las analíticas')).not.toBeInTheDocument()
  })
})

describe('EventAnalyticsPanel — KPI cards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the configured event capacity instead of deriving it from attendance', async () => {
    mockSWRSequence(makeAnalytics(), [makeGuest()])
    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" eventCapacity={100} />)

    expect(screen.getByText('100 capacidad')).toBeInTheDocument()
  })

  it('displays view count from analytics', async () => {
    await renderPanel(makeAnalytics({ views: 42 }), [])
    expect(getKPIValue('Vistas')).toBe('42')
  })

  it('normalizes wrapped Go analytics aliases before rendering KPI cards', async () => {
    await renderPanel(
      {
        Status: 200,
        Message: 'ok',
        Data: {
          ID: 'analytics-001',
          EventID: 'evt-001',
          Views: '17',
          MomentUploads: '4',
          MomentComments: '2',
          RSVPConfirmed: '8',
          RSVPDeclined: '1',
        },
      } as unknown as EventAnalytics,
      []
    )

    expect(getKPIValue('Vistas')).toBe('17')
    expect(getKPIValue('Momentos')).toBe('4')
  })

  it('clamps malformed analytics counters to safe KPI values', async () => {
    await renderPanel(
      {
        event_id: 'evt-001',
        views: '-5',
        moment_uploads: ' ',
      } as unknown as EventAnalytics,
      []
    )

    expect(getKPIValue('Vistas')).toBe('0')
    expect(getKPIValue('Momentos')).toBe('0')
  })

  it('displays confirmed count from current guest RSVP data', async () => {
    await renderPanel(makeAnalytics({ rsvp_confirmed: 7 }), [
      makeGuest({ id: 'g1', rsvp_status: 'confirmed' }),
      makeGuest({ id: 'g2', rsvp_status: 'pending' }),
    ])
    expect(getKPIValue('Confirmados')).toBe('1')
  })

  it('displays declined count from current guest RSVP data', async () => {
    await renderPanel(makeAnalytics({ rsvp_declined: 3 }), [
      makeGuest({ id: 'g1', rsvp_status: 'declined' }),
      makeGuest({ id: 'g2', rsvp_status: 'confirmed' }),
    ])
    expect(getKPIValue('Declinaron')).toBe('1')
  })

  it('displays response rate label', async () => {
    await renderPanel(makeAnalytics(), [
      makeGuest({ rsvp_status: 'confirmed' }),
      makeGuest({ id: 'g2', rsvp_status: 'declined' }),
      makeGuest({ id: 'g3', rsvp_status: 'pending' }),
    ])
    expect(screen.getByText('Tasa respuesta')).toBeInTheDocument()
  })

  it('computes 100% response rate when all guests responded', async () => {
    await renderPanel(makeAnalytics({ rsvp_confirmed: 2, rsvp_declined: 0 }), [
      makeGuest({ id: 'g1', rsvp_status: 'confirmed' }),
      makeGuest({ id: 'g2', rsvp_status: 'confirmed' }),
    ])
    expect(getKPIValue('Tasa respuesta')).toBe('100%')
  })

  it('computes 0% response rate when all guests are pending', async () => {
    await renderPanel(makeAnalytics({ rsvp_confirmed: 0, rsvp_declined: 0 }), [
      makeGuest({ id: 'g1', rsvp_status: 'pending' }),
    ])
    expect(getKPIValue('Tasa respuesta')).toBe('0%')
  })

  it('uses guest data when analytics rsvp values are undefined', async () => {
    await renderPanel({ event_id: 'evt-001', views: 5, moment_uploads: 0 } as EventAnalytics, [
      makeGuest({ id: 'g1', rsvp_status: 'confirmed' }),
      makeGuest({ id: 'g2', rsvp_status: 'confirmed' }),
    ])
    expect(getKPIValue('Confirmados')).toBe('2')
  })
})

describe('EventAnalyticsPanel — RSVP funnel chart', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders RSVP funnel section', async () => {
    await renderPanel(makeAnalytics(), [makeGuest()])
    expect(screen.getByText('Embudo RSVP')).toBeInTheDocument()
  })

  it('renders the bar chart component', async () => {
    await renderPanel(makeAnalytics(), [makeGuest()])
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })
})

describe('EventAnalyticsPanel — role composition chart', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders role composition section when guests have roles', async () => {
    await renderPanel(makeAnalytics(), [makeGuest({ role: 'graduate' }), makeGuest({ id: 'g2', role: 'vip' })])
    expect(screen.getByText('Composición por rol')).toBeInTheDocument()
  })

  it('renders a pie chart for role composition', async () => {
    await renderPanel(makeAnalytics(), [makeGuest({ role: 'graduate' })])
    // May render multiple pie charts (role + RSVP method), just verify at least one exists
    const pieCharts = screen.getAllByTestId('pie-chart')
    expect(pieCharts.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT render role section when guest list is empty', async () => {
    await renderPanel(makeAnalytics(), [])
    expect(screen.queryByText('Composición por rol')).not.toBeInTheDocument()
  })
})

describe('EventAnalyticsPanel — dietary restrictions chart', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does NOT render dietary section when no guests have restrictions', async () => {
    await renderPanel(makeAnalytics(), [
      makeGuest({ dietary_restrictions: '' }),
      makeGuest({ id: 'g2', dietary_restrictions: undefined }),
    ])
    expect(screen.queryByText('Restricciones alimentarias')).not.toBeInTheDocument()
  })

  it('renders dietary section when at least one guest has restrictions', async () => {
    await renderPanel(makeAnalytics(), [
      makeGuest({ dietary_restrictions: '' }),
      makeGuest({ id: 'g2', dietary_restrictions: 'Vegano' }),
    ])
    expect(screen.getByText('Restricciones alimentarias')).toBeInTheDocument()
  })

  it('ignores dietary restrictions from declined guests', async () => {
    await renderPanel(makeAnalytics(), [
      makeGuest({ id: 'g1', rsvp_status: 'declined', dietary_restrictions: 'Vegano' }),
      makeGuest({ id: 'g2', rsvp_status: 'pending', dietary_restrictions: 'Sin gluten' }),
    ])
    expect(screen.queryByText('Restricciones alimentarias')).not.toBeInTheDocument()
  })

  it('renders dietary section with multiple restriction types', async () => {
    await renderPanel(makeAnalytics(), [
      makeGuest({ id: 'g1', dietary_restrictions: 'Vegano' }),
      makeGuest({ id: 'g2', dietary_restrictions: 'Vegano' }),
      makeGuest({ id: 'g3', dietary_restrictions: 'Sin gluten' }),
    ])
    expect(screen.getByText('Restricciones alimentarias')).toBeInTheDocument()
    const piecharts = screen.getAllByTestId('pie-chart')
    expect(piecharts.length).toBeGreaterThanOrEqual(2)
  })
})

describe('EventAnalyticsPanel — moment uploads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does NOT show moments engagement section when no moments exist', async () => {
    await renderPanel(makeAnalytics({ moment_uploads: 0 }), [])
    expect(screen.queryByText('Engagement de momentos')).not.toBeInTheDocument()
  })

  it('shows moments engagement section when moments exist', async () => {
    await renderPanel(makeAnalytics({ moment_uploads: 12, moment_total: 2, moment_approved: 1, moment_pending: 1 }), [])

    expect(screen.getByText('Engagement de momentos')).toBeInTheDocument()
    expect(screen.getByText('Total subidos')).toBeInTheDocument()
  })

  it('shows moments engagement from the aggregate counters', async () => {
    await renderPanel(makeAnalytics({ moment_uploads: 12, moment_comments: 2 }), [])

    const section = screen.getByText('Engagement de momentos').closest('div')
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getByText('12')).toBeInTheDocument()
    expect(screen.getByText('2 momentos con mensaje de invitado')).toBeInTheDocument()
  })

  it('uses the server aggregate when persisted upload counters lag behind', async () => {
    await renderPanel(makeAnalytics({ moment_uploads: 2, moment_total: 2, moment_approved: 1, moment_pending: 1 }), [])

    expect(getKPIValue('Momentos')).toBe('2')
  })
})
