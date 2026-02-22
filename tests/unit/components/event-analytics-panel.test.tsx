/**
 * event-analytics-panel.test.tsx
 * Unit tests for EventAnalyticsPanel — KPI cards, RSVP funnel,
 * role chart, dietary chart visibility, and moment uploads.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventAnalytics } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('swr', () => ({
    default: vi.fn(),
}))

// Recharts doesn't render in happy-dom (no real canvas/SVG layout).
// Replace with lightweight stubs that still render their children/data.
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
    BarChart:    ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    Bar:         () => <div data-testid="bar" />,
    XAxis:       () => null,
    YAxis:       () => null,
    Tooltip:     () => null,
    PieChart:    ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
    Pie:         ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
    Cell:        () => null,
    Legend:      () => null,
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const makeGuest = (overrides: Partial<Guest> = {}): Guest => ({
    id:                   'guest-001',
    first_name:           'Juan',
    last_name:            'Pérez',
    email:                'juan@example.com',
    rsvp_status:          'confirmed',
    role:                 'guest',
    event_id:             'evt-001',
    dietary_restrictions: '',
    created_at:           '2026-01-01T00:00:00Z',
    updated_at:           '2026-01-01T00:00:00Z',
    ...overrides,
} as Guest)

const makeAnalytics = (overrides: Partial<EventAnalytics> = {}): EventAnalytics => ({
    event_id:       'evt-001',
    views:          42,
    rsvp_confirmed: 8,
    rsvp_declined:  2,
    moment_uploads: 0,
    ...overrides,
} as EventAnalytics)

// ── Helpers ───────────────────────────────────────────────────────────────────

import useSWR from 'swr'

function mockSWRSequence(analytics: EventAnalytics | undefined, guests: Guest[]) {
    vi.mocked(useSWR)
        // First call: analytics
        .mockReturnValueOnce({
            data:         analytics,
            isLoading:    false,
            error:        undefined,
            isValidating: false,
            mutate:       vi.fn(),
        } as ReturnType<typeof useSWR>)
        // Second call: guests
        .mockReturnValue({
            data:         guests,
            isLoading:    false,
            error:        undefined,
            isValidating: false,
            mutate:       vi.fn(),
        } as ReturnType<typeof useSWR>)
}

function mockSWRLoading() {
    vi.mocked(useSWR).mockReturnValue({
        data:         undefined,
        isLoading:    true,
        error:        undefined,
        isValidating: true,
        mutate:       vi.fn(),
    } as ReturnType<typeof useSWR>)
}

async function renderPanel(analytics?: EventAnalytics, guests: Guest[] = []) {
    mockSWRSequence(analytics, guests)
    const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
    render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EventAnalyticsPanel — loading state', () => {

    beforeEach(() => vi.clearAllMocks())

    it('renders skeleton while loading', async () => {
        mockSWRLoading()
        const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
        render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)
        // Skeleton renders animated cards
        const animatedEl = document.querySelector('.animate-pulse')
        expect(animatedEl).toBeInTheDocument()
    })
})

describe('EventAnalyticsPanel — KPI cards', () => {

    beforeEach(() => vi.clearAllMocks())

    it('displays view count from analytics', async () => {
        await renderPanel(makeAnalytics({ views: 42 }), [])
        expect(screen.getByText('42')).toBeInTheDocument()
        expect(screen.getByText('Vistas')).toBeInTheDocument()
    })

    it('displays confirmed count from analytics', async () => {
        await renderPanel(makeAnalytics({ rsvp_confirmed: 7 }), [])
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('Confirmados')).toBeInTheDocument()
    })

    it('displays declined count from analytics', async () => {
        await renderPanel(makeAnalytics({ rsvp_declined: 3 }), [])
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('Declinaron')).toBeInTheDocument()
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
        expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('computes 0% response rate when all guests are pending', async () => {
        await renderPanel(makeAnalytics({ rsvp_confirmed: 0, rsvp_declined: 0 }), [
            makeGuest({ id: 'g1', rsvp_status: 'pending' }),
        ])
        expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('falls back to guest data when analytics rsvp values are undefined', async () => {
        await renderPanel(
            { event_id: 'evt-001', views: 5, moment_uploads: 0 } as EventAnalytics,
            [
                makeGuest({ id: 'g1', rsvp_status: 'confirmed' }),
                makeGuest({ id: 'g2', rsvp_status: 'confirmed' }),
            ],
        )
        // Should compute confirmed = 2 from guests
        const twos = screen.getAllByText('2')
        expect(twos.length).toBeGreaterThanOrEqual(1)
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
        await renderPanel(makeAnalytics(), [
            makeGuest({ role: 'graduate' }),
            makeGuest({ id: 'g2', role: 'vip' }),
        ])
        expect(screen.getByText('Composición por rol')).toBeInTheDocument()
    })

    it('renders a pie chart for role composition', async () => {
        await renderPanel(makeAnalytics(), [
            makeGuest({ role: 'graduate' }),
        ])
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
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

    it('renders dietary section with multiple restriction types', async () => {
        await renderPanel(makeAnalytics(), [
            makeGuest({ id: 'g1', dietary_restrictions: 'Vegano' }),
            makeGuest({ id: 'g2', dietary_restrictions: 'Vegano' }),
            makeGuest({ id: 'g3', dietary_restrictions: 'Sin gluten' }),
        ])
        expect(screen.getByText('Restricciones alimentarias')).toBeInTheDocument()
        // Two pie charts: role + dietary
        const piecharts = screen.getAllByTestId('pie-chart')
        expect(piecharts.length).toBeGreaterThanOrEqual(2)
    })
})

describe('EventAnalyticsPanel — moment uploads', () => {

    beforeEach(() => vi.clearAllMocks())

    it('does NOT show moment uploads section when count is 0', async () => {
        await renderPanel(makeAnalytics({ moment_uploads: 0 }), [])
        expect(screen.queryByText(/momentos subidos/i)).not.toBeInTheDocument()
    })

    it('shows moment uploads section when count is greater than 0', async () => {
        await renderPanel(makeAnalytics({ moment_uploads: 12 }), [])
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText(/momentos subidos/i)).toBeInTheDocument()
    })
})
