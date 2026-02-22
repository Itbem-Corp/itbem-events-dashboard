/**
 * moments-wall.test.tsx
 * Unit tests for MomentsWall component — filter tabs, approve/delete actions,
 * processing status badges, and empty states.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Moment } from '@/models/Moment'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('swr', () => ({
    default: vi.fn(),
    mutate: vi.fn(),
}))

vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
            <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/api', () => ({
    api: {
        put:    vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
    },
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error:   vi.fn(),
        info:    vi.fn(),
    },
}))

// Mock qrcode.react so it doesn't render SVG in tests
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value} />,
}))

// Mock JSZip
vi.mock('jszip', () => ({
    default: vi.fn().mockImplementation(() => ({
        folder: vi.fn().mockReturnThis(),
        file: vi.fn(),
        generateAsync: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
    })),
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const makeMoment = (overrides: Partial<Moment> = {}): Moment => ({
    id:                'moment-001',
    description:       'Felicidades!',
    is_approved:       false,
    processing_status: 'done',
    content_url:       '',
    created_at:        '2026-01-15T12:00:00Z',
    event_id:          'evt-001',
    ...overrides,
} as Moment)

const makePhotoMoment = (overrides: Partial<Moment> = {}): Moment =>
    makeMoment({
        id:          'moment-photo-001',
        content_url: 'https://cdn.example.com/photo.jpg',
        ...overrides,
    })

// ── Helpers ───────────────────────────────────────────────────────────────────

import useSWR from 'swr'
import { api } from '@/lib/api'

function mockSWR(data: Moment[] = [], isLoading = false) {
    vi.mocked(useSWR).mockReturnValue({
        data,
        isLoading,
        error:        undefined,
        isValidating: false,
        mutate:       vi.fn(),
    } as ReturnType<typeof useSWR>)
}

async function renderWall(moments: Moment[] = [], isLoading = false) {
    mockSWR(moments, isLoading)
    const { MomentsWall } = await import('@/components/events/moments-wall')
    render(<MomentsWall eventId="evt-001" eventIdentifier="evento-test" eventName="Evento Test" />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MomentsWall — loading state', () => {

    beforeEach(() => vi.clearAllMocks())

    it('renders skeleton cards while loading', async () => {
        await renderWall([], true)
        const skeletons = document.querySelectorAll('.skeleton')
        expect(skeletons.length).toBe(8)
    })
})

describe('MomentsWall — empty state', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows generic empty state when no moments', async () => {
        await renderWall([])
        expect(screen.getByText('Sin momentos')).toBeInTheDocument()
        expect(screen.getByText(/Los invitados aún no han compartido/)).toBeInTheDocument()
    })

    it('shows pending-specific empty state when pending filter active', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        fireEvent.click(screen.getByRole('tab', { name: 'Pendientes' }))
        await waitFor(() => {
            expect(screen.getByText(/No hay momentos pendientes/)).toBeInTheDocument()
        })
    })

    it('shows approved-specific empty state when approved filter active', async () => {
        await renderWall([makeMoment({ is_approved: false })])
        fireEvent.click(screen.getByRole('tab', { name: 'Aprobados' }))
        await waitFor(() => {
            expect(screen.getByText(/Aún no hay momentos aprobados/)).toBeInTheDocument()
        })
    })
})

describe('MomentsWall — header info', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows total moment count', async () => {
        await renderWall([makeMoment(), makePhotoMoment()])
        expect(screen.getByText(/2 momentos en total/)).toBeInTheDocument()
    })

    it('shows singular "momento" for single item', async () => {
        await renderWall([makeMoment()])
        expect(screen.getByText(/1 momento en total/)).toBeInTheDocument()
    })

    it('shows pending badge when there are pending moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false }),
            makeMoment({ id: 'm2', is_approved: false }),
        ])
        expect(screen.getByText(/2 pendientes/)).toBeInTheDocument()
    })

    it('does not show pending badge when all moments are approved', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        expect(screen.queryByText(/pendiente/)).not.toBeInTheDocument()
    })

    it('shows QR button', async () => {
        await renderWall([])
        expect(screen.getByRole('button', { name: /QR de subida/i })).toBeInTheDocument()
    })
})

describe('MomentsWall — filter tabs', () => {

    beforeEach(() => vi.clearAllMocks())

    it('renders all three filter tabs', async () => {
        await renderWall([])
        expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Pendientes' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Aprobados' })).toBeInTheDocument()
    })

    it('"Todos" shows both pending and approved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Mensaje de Ana' }),
            makePhotoMoment({ id: 'm2', is_approved: true, description: 'Foto de Carlos' }),
        ])
        expect(screen.getByText(/Mensaje de Ana/)).toBeInTheDocument()
        expect(screen.getByText(/Foto de Carlos/)).toBeInTheDocument()
    })

    it('"Pendientes" filter shows only unapproved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Pendiente de Ana' }),
            makePhotoMoment({ id: 'm2', is_approved: true, description: 'Aprobado de Carlos' }),
        ])
        fireEvent.click(screen.getByRole('tab', { name: 'Pendientes' }))
        await waitFor(() => {
            expect(screen.getByText(/Pendiente de Ana/)).toBeInTheDocument()
            expect(screen.queryByText(/Aprobado de Carlos/)).not.toBeInTheDocument()
        })
    })

    it('"Aprobados" filter shows only approved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Pendiente de Ana' }),
            makePhotoMoment({ id: 'm2', is_approved: true, description: 'Aprobado de Carlos' }),
        ])
        fireEvent.click(screen.getByRole('tab', { name: 'Aprobados' }))
        await waitFor(() => {
            expect(screen.queryByText(/Pendiente de Ana/)).not.toBeInTheDocument()
            expect(screen.getByText(/Aprobado de Carlos/)).toBeInTheDocument()
        })
    })
})

describe('MomentsWall — approve action', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows "Aprobar" button for pending moments', async () => {
        await renderWall([makeMoment({ is_approved: false })])
        expect(screen.getByRole('button', { name: /Aprobar/i })).toBeInTheDocument()
    })

    it('does NOT show "Aprobar" button for already-approved moments', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        expect(screen.queryByRole('button', { name: /Aprobar/i })).not.toBeInTheDocument()
    })

    it('clicking Aprobar calls api.put with is_approved: true', async () => {
        const moment = makeMoment({ is_approved: false })
        await renderWall([moment])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }))
        })
        await waitFor(() => {
            expect(vi.mocked(api.put)).toHaveBeenCalledWith(
                `/moments/${moment.id}`,
                expect.objectContaining({ is_approved: true }),
            )
        })
    })

    it('shows success toast after approving', async () => {
        const { toast } = await import('sonner')
        await renderWall([makeMoment({ is_approved: false })])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }))
        })
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Momento aprobado')
        })
    })

    it('shows error toast when approve fails', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(new Error('Network error'))
        const { toast } = await import('sonner')
        await renderWall([makeMoment({ is_approved: false })])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }))
        })
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Error al aprobar el momento')
        })
    })
})

describe('MomentsWall — delete action', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows "Eliminar" button for every moment', async () => {
        await renderWall([makeMoment(), makePhotoMoment({ id: 'm2' })])
        const deleteBtns = screen.getAllByRole('button', { name: /Eliminar/i })
        expect(deleteBtns).toHaveLength(2)
    })

    it('clicking Eliminar calls api.delete with correct moment id', async () => {
        const moment = makeMoment({ id: 'moment-xyz' })
        await renderWall([moment])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
        })
        await waitFor(() => {
            expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/moments/moment-xyz')
        })
    })

    it('shows success toast after deleting', async () => {
        const { toast } = await import('sonner')
        await renderWall([makeMoment()])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
        })
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Momento eliminado')
        })
    })

    it('shows error toast when delete fails', async () => {
        vi.mocked(api.delete).mockRejectedValueOnce(new Error('Network error'))
        const { toast } = await import('sonner')
        await renderWall([makeMoment()])
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
        })
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Error al eliminar el momento')
        })
    })
})

describe('MomentsWall — moment card content', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows "Aprobado" badge for approved moments', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        expect(screen.getByText('Aprobado')).toBeInTheDocument()
    })

    it('shows "Pendiente" badge for pending moments', async () => {
        await renderWall([makeMoment({ is_approved: false })])
        expect(screen.getByText('Pendiente')).toBeInTheDocument()
    })

    it('renders image when content_url is provided', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        const img = screen.getByRole('img', { name: /momento del evento/i })
        expect(img).toHaveAttribute('src', 'https://cdn.example.com/photo.jpg')
    })

    it('renders description text when no content_url', async () => {
        await renderWall([makeMoment({ content_url: '', description: 'Muchas felicidades!' })])
        expect(screen.getByText(/Muchas felicidades!/)).toBeInTheDocument()
    })

    it('shows "Procesando…" placeholder for processing moments', async () => {
        await renderWall([makeMoment({ processing_status: 'processing' })])
        expect(screen.getByText('Procesando…')).toBeInTheDocument()
    })

    it('shows "En cola" placeholder for pending processing moments', async () => {
        await renderWall([makeMoment({ processing_status: 'pending' })])
        expect(screen.getByText('En cola')).toBeInTheDocument()
    })

    it('shows error state for failed processing', async () => {
        await renderWall([makeMoment({ processing_status: 'failed' })])
        expect(screen.getByText('Error al procesar el archivo')).toBeInTheDocument()
    })
})

describe('MomentsWall — QR modal', () => {

    beforeEach(() => vi.clearAllMocks())

    it('opens QR modal on button click', async () => {
        await renderWall([])
        fireEvent.click(screen.getByRole('button', { name: /QR de subida/i }))
        await waitFor(() => {
            expect(screen.getByTestId('qr-code')).toBeInTheDocument()
        })
    })
})
