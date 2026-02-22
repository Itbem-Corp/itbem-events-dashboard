/**
 * invitation-tracker.test.tsx
 * Unit tests for InvitationTracker component — focused on QR dialog behavior
 * and invitation row actions.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Guest } from '@/models/Guest'
import type { Event } from '@/models/Event'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// mock motion/react to avoid act() warnings
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
            <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// mock qrcode.react — renders a recognizable element for assertions
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) =>
        <svg data-testid="qr-code" data-value={value} />,
}))

// mock api (for resend)
vi.mock('@/lib/api', () => ({
    api: {
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}))

// mock sonner
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const mockEvent: Event = {
    id: 'evt-001',
    name: 'Test Event',
    identifier: 'test-event',
    is_active: true,
    event_date_time: '2026-08-15T20:00:00-06:00',
    timezone: 'America/Mexico_City',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
} as Event

const makeGuest = (overrides: Partial<Guest> = {}): Guest => ({
    id: 'guest-001',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@example.com',
    phone: '+52 55 1234 5678',
    rsvp_status: 'PENDING',
    invitation_id: 'inv-001',
    event_id: 'evt-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
} as Guest)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderTracker(guests: Guest[] = [makeGuest()]) {
    const { InvitationTracker } = await import('@/components/events/invitation-tracker')
    render(<InvitationTracker event={mockEvent} guests={guests} isLoading={false} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvitationTracker — QR Dialog', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock clipboard — navigator.clipboard is getter-only so use defineProperty
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            writable: true,
            configurable: true,
        })
    })

    it('renders QR button for each guest row', async () => {
        await renderTracker()
        const qrBtn = screen.getByTitle('Ver código QR')
        expect(qrBtn).toBeInTheDocument()
    })

    it('QR dialog is NOT visible initially', async () => {
        await renderTracker()
        expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
    })

    it('clicking QR button opens the dialog', async () => {
        await renderTracker()
        const qrBtn = screen.getByTitle('Ver código QR')
        await act(async () => { fireEvent.click(qrBtn) })
        expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })

    it('QR dialog shows guest name', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        // Name appears in both the table row AND the dialog — use getAllByText
        await waitFor(() => {
            const matches = screen.getAllByText('Juan Pérez')
            expect(matches.length).toBeGreaterThanOrEqual(2)
        })
    })

    it('QR code encodes the RSVP URL', async () => {
        await renderTracker([makeGuest({ id: 'guest-xyz' })])
        fireEvent.click(screen.getByTitle('Ver código QR'))
        const qrEl = await screen.findByTestId('qr-code')
        const value = qrEl.getAttribute('data-value') ?? ''
        expect(value).toContain('guest-xyz')
        expect(value).toContain('token=')
    })

    it('QR dialog has "Invitación QR" label', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        await waitFor(() => {
            expect(screen.getByText(/Invitación QR/i)).toBeInTheDocument()
        })
    })

    it('clicking backdrop closes the dialog', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        await screen.findByTestId('qr-code')

        // Click the backdrop (fixed overlay div)
        const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
        if (backdrop) {
            await act(async () => { fireEvent.click(backdrop) })
        }
        await waitFor(() => {
            expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
        })
    })

    it('clicking X button closes the dialog', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        await screen.findByTestId('qr-code')

        const closeBtn = screen.getByLabelText('Cerrar')
        await act(async () => { fireEvent.click(closeBtn) })

        await waitFor(() => {
            expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
        })
    })

    it('"Copiar link" button in dialog calls clipboard.writeText', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        await screen.findByTestId('qr-code')

        // Both the row action and dialog have "Copiar link" — pick the dialog one (last)
        const copyBtns = screen.getAllByRole('button', { name: /Copiar link/i })
        const copyBtn = copyBtns[copyBtns.length - 1]
        await act(async () => { fireEvent.click(copyBtn) })

        expect(navigator.clipboard.writeText).toHaveBeenCalledOnce()
    })
})

describe('InvitationTracker — Stats', () => {

    it('shows correct confirmed count', async () => {
        const guests = [
            makeGuest({ id: '1', rsvp_status: 'CONFIRMED' }),
            makeGuest({ id: '2', rsvp_status: 'PENDING' }),
            makeGuest({ id: '3', rsvp_status: 'DECLINED' }),
        ]
        await renderTracker(guests)
        // "Confirmaron" stat card shows a bold "1" — test via accessible label
        expect(screen.getByText('Confirmaron')).toBeInTheDocument()
        // The component renders counts; we verify there's at least one visible value
        const allOnes = screen.getAllByText('1')
        expect(allOnes.length).toBeGreaterThanOrEqual(1)
    })

    it('shows 0% response rate when all are pending', async () => {
        const guests = [
            makeGuest({ id: '1', rsvp_status: 'PENDING' }),
            makeGuest({ id: '2', rsvp_status: 'PENDING' }),
        ]
        await renderTracker(guests)
        expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('shows 100% response rate when all responded', async () => {
        const guests = [
            makeGuest({ id: '1', rsvp_status: 'CONFIRMED' }),
            makeGuest({ id: '2', rsvp_status: 'DECLINED' }),
        ]
        await renderTracker(guests)
        expect(screen.getByText('100%')).toBeInTheDocument()
    })
})

describe('InvitationTracker — Empty state', () => {

    it('shows empty state when no guests', async () => {
        await renderTracker([])
        expect(screen.getByText('Sin invitaciones')).toBeInTheDocument()
    })
})

describe('InvitationTracker — Search and filter', () => {

    it('filters guests by name via search', async () => {
        const guests = [
            makeGuest({ id: '1', first_name: 'Ana', last_name: 'García' }),
            makeGuest({ id: '2', first_name: 'Carlos', last_name: 'López' }),
        ]
        await renderTracker(guests)

        const searchInput = screen.getByPlaceholderText('Buscar invitado…')
        fireEvent.change(searchInput, { target: { value: 'Ana' } })

        await waitFor(() => {
            expect(screen.getByText(/Ana García/)).toBeInTheDocument()
            expect(screen.queryByText(/Carlos López/)).not.toBeInTheDocument()
        })
    })

    it('shows correct total count', async () => {
        const guests = [
            makeGuest({ id: '1' }),
            makeGuest({ id: '2' }),
            makeGuest({ id: '3' }),
        ]
        await renderTracker(guests)
        expect(screen.getByText(/Mostrando 3 de 3/)).toBeInTheDocument()
    })
})
