/**
 * event-analytics-panel.test.tsx
 * Unit tests for EventAnalyticsPanel — KPI cards, RSVP funnel,
 * role chart, dietary chart visibility, and moment uploads.
 */

import { render, screen, within } from '@testing-library/react'
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
    AreaChart:   ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
    Area:        () => null,
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
        .mockReturnValueOnce({
            data:         guests,
            isLoading:    false,
            error:        undefined,
            isValidating: false,
            mutate:       vi.fn(),
        } as ReturnType<typeof useSWR>)
        // Third call: moments
        .mockReturnValue({
            data:         [],
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

/**
 * Helper: find KPI card by its uppercase label and return the value text.
 * KPI labels use class "text-xs text-zinc-500 uppercase tracking-wide".
 */
function getKPIValue(label: string): string {
    const allLabels = screen.getAllByText(label)
    // Pick the one inside a KPI card (has the uppercase tracking-wide class)
    const kpiLabel = allLabels.find(el => el.classList.contains('uppercase')) ?? allLabels[0]
    const card = kpiLabel.closest('div[class*="rounded-xl"]')!
    const valueEl = card.querySelector('p[class*="text-2xl"]')
    return valueEl?.textContent?.trim() ?? ''
}

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

describe('EventAnalyticsPanel — KPI cards', () => {

    beforeEach(() => vi.clearAllMocks())

    it('displays view count from analytics', async () => {
        await renderPanel(makeAnalytics({ views: 42 }), [])
        expect(getKPIValue('Vistas')).toBe('42')
    })

    it('displays confirmed count from analytics', async () => {
        await renderPanel(makeAnalytics({ rsvp_confirmed: 7 }), [])
        expect(getKPIValue('Confirmados')).toBe('7')
    })

    it('displays declined count from analytics', async () => {
        await renderPanel(makeAnalytics({ rsvp_declined: 3 }), [])
        expect(getKPIValue('Declinaron')).toBe('3')
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

    it('falls back to guest data when analytics rsvp values are undefined', async () => {
        await renderPanel(
            { event_id: 'evt-001', views: 5, moment_uploads: 0 } as EventAnalytics,
            [
                makeGuest({ id: 'g1', rsvp_status: 'confirmed' }),
                makeGuest({ id: 'g2', rsvp_status: 'confirmed' }),
            ],
        )
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
        // Mock with actual moments data in the 3rd SWR call
        vi.mocked(useSWR)
            .mockReturnValueOnce({
                data: makeAnalytics({ moment_uploads: 12 }),
                isLoading: false, error: undefined, isValidating: false, mutate: vi.fn(),
            } as ReturnType<typeof useSWR>)
            .mockReturnValueOnce({
                data: [],
                isLoading: false, error: undefined, isValidating: false, mutate: vi.fn(),
            } as ReturnType<typeof useSWR>)
            .mockReturnValue({
                data: [
                    { id: 'm1', is_approved: true, processing_status: 'done', description: 'Nice!' },
                    { id: 'm2', is_approved: false, processing_status: 'pending', description: '' },
                ],
                isLoading: false, error: undefined, isValidating: false, mutate: vi.fn(),
            } as ReturnType<typeof useSWR>)

        const { EventAnalyticsPanel } = await import('@/components/events/event-analytics-panel')
        render(<EventAnalyticsPanel eventId="evt-001" eventIdentifier="test-event" />)

        expect(screen.getByText('Engagement de momentos')).toBeInTheDocument()
        expect(screen.getByText('Total subidos')).toBeInTheDocument()
    })
})
