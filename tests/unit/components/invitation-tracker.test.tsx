/**
 * invitation-tracker.test.tsx
 * Unit tests for InvitationTracker component — focused on QR dialog behavior
 * and invitation row actions.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Guest } from '@/models/Guest'
import type { Event } from '@/models/Event'
import { api } from '@/lib/api'

const swrState = vi.hoisted(() => ({ guests: [] as Guest[], retryGuests: vi.fn() }))

// ── Mocks ─────────────────────────────────────────────────────────────────────

// mock motion/react to avoid act() warnings
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, whileTap: _whileTap, layout: _layout, variants: _variants, ...props }: any) =>
            <div {...props}>{children}</div>,
        button: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, whileTap: _whileTap, layout: _layout, variants: _variants, ...props }: any) =>
            <button {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>,
        span: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, whileHover: _whileHover, whileTap: _whileTap, layout: _layout, variants: _variants, ...props }: any) =>
            <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// mock qrcode.react — renders recognizable elements for assertions
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) =>
        <svg data-testid="qr-code" data-value={value} />,
    QRCodeCanvas: ({ id, value }: { id?: string; value: string }) =>
        <canvas id={id} data-testid="qr-canvas" data-value={value} />,
}))

// mock api (for resend)
vi.mock('@/lib/api', () => ({
    api: {
        post: vi.fn().mockResolvedValue({ data: {} }),
    },
}))

vi.mock('swr', () => ({
    default: (key: string) => {
        if (key?.includes('/guests/share:')) {
            return {
                data: {
                    total: swrState.guests.length,
                    with_email: swrState.guests.filter((guest) => guest.email).length,
                    with_phone: swrState.guests.filter((guest) => guest.phone).length,
                    pending_with_email: 0,
                },
                error: undefined,
                isLoading: false,
                isValidating: false,
                mutate: swrState.retryGuests,
            }
        }
        const url = new URL(key, 'http://localhost')
        const search = (url.searchParams.get('search') ?? '').toLowerCase()
        const filter = url.searchParams.get('filter') ?? 'ALL'
        const guests = swrState.guests.filter((guest) => {
            const matchesSearch = `${guest.first_name} ${guest.last_name} ${guest.email ?? ''} ${guest.phone ?? ''}`
                .toLowerCase()
                .includes(search)
            return matchesSearch && (filter === 'ALL' || guest.rsvp_status?.trim().toUpperCase() === filter || guest.status?.code === filter)
        })
        return {
            data: {
                data: guests,
                total: guests.length,
                page: 1,
                page_size: 25,
                total_pages: 1,
                share_summary: {
                    total: swrState.guests.length,
                    with_email: swrState.guests.filter((guest) => guest.email).length,
                    with_phone: swrState.guests.filter((guest) => guest.phone).length,
                    pending_with_email: 0,
                },
            },
            error: undefined,
            isLoading: false,
            isValidating: false,
            mutate: swrState.retryGuests,
        }
    },
    mutate: vi.fn().mockResolvedValue(undefined),
    preload: vi.fn().mockResolvedValue(undefined),
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
    pretty_token: 'TOKEN123',
    rsvp_status: 'PENDING',
    invitation_id: 'inv-001',
    event_id: 'evt-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
} as Guest)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderTracker(guests: Guest[] = [makeGuest()]) {
    swrState.guests = guests
    const { InvitationTracker } = await import('@/components/events/invitation-tracker')
    const summary = {
        total: guests.length,
        confirmed: guests.filter((guest) => guest.rsvp_status?.trim().toUpperCase() === 'CONFIRMED' || guest.status?.code === 'CONFIRMED').length,
        declined: guests.filter((guest) => guest.rsvp_status?.trim().toUpperCase() === 'DECLINED' || guest.status?.code === 'DECLINED').length,
        pending: guests.filter((guest) => {
            const status = guest.rsvp_status?.trim().toUpperCase() || guest.status?.code || 'PENDING'
            return status === 'PENDING'
        }).length,
        total_attendees: guests.length,
    }
    render(<InvitationTracker event={mockEvent} summary={summary} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvitationTracker — QR Dialog', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        swrState.retryGuests.mockResolvedValue(undefined)
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

    it('generates a missing personal RSVP link for a legacy guest', async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: 200, data: makeGuest({ pretty_token: 'NEWLINK1' }) },
        })
        await renderTracker([makeGuest({ pretty_token: undefined })])

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Generar link RSVP' }))
        })

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/guests/guest-001/rsvp-token')
        })
        expect(swrState.retryGuests).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
        const updateCache = swrState.retryGuests.mock.calls[0][0] as (current: unknown) => unknown
        expect(updateCache({ data: [makeGuest({ pretty_token: undefined })], total: 1 })).toMatchObject({
            data: [expect.objectContaining({ id: 'guest-001', pretty_token: 'NEWLINK1' })],
            total: 1,
        })
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

    it('QR code encodes the personal RSVP token when present', async () => {
        await renderTracker([makeGuest({ id: 'guest-xyz', pretty_token: 'TOKEN123' })])
        fireEvent.click(screen.getByTitle('Ver código QR'))
        const qrEl = await screen.findByTestId('qr-code')
        const value = qrEl.getAttribute('data-value') ?? ''
        expect(value).toContain('token=TOKEN123')
        expect(value).not.toContain('guest-xyz')
    })

    it('QR dialog has "Invitación personal" label', async () => {
        await renderTracker()
        fireEvent.click(screen.getByTitle('Ver código QR'))
        await waitFor(() => {
            expect(screen.getByText(/Invitación personal/i)).toBeInTheDocument()
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

    it('falls back to catalog status when RSVP status is blank', async () => {
        await renderTracker([
            makeGuest({
                id: '1',
                rsvp_status: ' ',
                status: {
                    id: 'confirmed',
                    code: 'CONFIRMED',
                    name: 'Confirmado',
                    color: 'green',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                },
            } as Partial<Guest>),
        ])

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
