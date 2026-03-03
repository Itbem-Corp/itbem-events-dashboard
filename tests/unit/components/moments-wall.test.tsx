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
        div: ({ children, layout, ...props }: any) =>
            <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/api', () => ({
    api: {
        get:    vi.fn().mockResolvedValue({ data: new Blob() }),
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

// Mock qrcode.react so it doesn't render real QR in tests
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value} />,
    QRCodeCanvas: ({ id, value }: { id?: string; value: string }) => <canvas id={id} data-testid="qr-canvas" data-value={value} />,
}))

// Mock JSZip
vi.mock('jszip', () => ({
    default: vi.fn().mockImplementation(() => ({
        folder: vi.fn().mockReturnThis(),
        file: vi.fn(),
        generateAsync: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
    })),
}))

// Mock BrandedQR
vi.mock('@/components/ui/branded-qr', () => ({
    BrandedQR: ({ value }: { value: string }) => <div data-testid="branded-qr" data-value={value} />,
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
    render(<MomentsWall eventId="evt-001" eventIdentifier="evento-test" eventName="Evento Test" shareUploadsEnabled />)
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

    it('shows coming-soon hero when no moments at all', async () => {
        await renderWall([])
        expect(screen.getByText('El muro de momentos está listo')).toBeInTheDocument()
        expect(screen.getByText(/Cuando los invitados compartan fotos/)).toBeInTheDocument()
    })

    it('shows pending-specific empty state when pending filter active', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        // Tab name includes count: "Pendientes 0" or just "Pendientes"
        const pendingTab = screen.getByRole('tab', { name: /Pendientes/ })
        fireEvent.click(pendingTab)
        await waitFor(() => {
            expect(screen.getByText(/No hay momentos pendientes/)).toBeInTheDocument()
        })
    })

    it('shows approved-specific empty state when approved filter active', async () => {
        await renderWall([makeMoment({ is_approved: false })])
        const approvedTab = screen.getByRole('tab', { name: /Aprobados/ })
        fireEvent.click(approvedTab)
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
        expect(screen.getByText(/2 pendiente/)).toBeInTheDocument()
    })

    it('does not show pending badge when all moments are approved', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        // The header text should not mention "pendiente"
        const headerInfo = screen.queryByText(/\d+ pendiente/)
        expect(headerInfo).not.toBeInTheDocument()
    })

    it('shows QR button when share uploads enabled', async () => {
        await renderWall([makeMoment()])
        // Button has title "Generar QR para subida compartida"
        expect(screen.getByTitle('Generar QR para subida compartida')).toBeInTheDocument()
    })
})

describe('MomentsWall — filter tabs', () => {

    beforeEach(() => vi.clearAllMocks())

    it('renders all three filter tabs', async () => {
        await renderWall([])
        expect(screen.getByRole('tab', { name: /Todos/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Pendientes/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Aprobados/ })).toBeInTheDocument()
    })

    it('"Todos" shows both pending and approved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Mensaje de Ana' }),
            // No content_url: description renders as the card body (new full-bleed design
            // only shows description text when there is no media to display).
            makeMoment({ id: 'm2', is_approved: true, description: 'Foto de Carlos' }),
        ])
        expect(screen.getByText(/Mensaje de Ana/)).toBeInTheDocument()
        expect(screen.getByText(/Foto de Carlos/)).toBeInTheDocument()
    })

    it('"Pendientes" filter shows only unapproved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Pendiente de Ana' }),
            makePhotoMoment({ id: 'm2', is_approved: true, description: 'Aprobado de Carlos' }),
        ])
        fireEvent.click(screen.getByRole('tab', { name: /Pendientes/ }))
        await waitFor(() => {
            expect(screen.getByText(/Pendiente de Ana/)).toBeInTheDocument()
            expect(screen.queryByText(/Aprobado de Carlos/)).not.toBeInTheDocument()
        })
    })

    it('"Aprobados" filter shows only approved moments', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false, description: 'Pendiente de Ana' }),
            // No content_url so description is rendered as card body.
            makeMoment({ id: 'm2', is_approved: true, description: 'Aprobado de Carlos' }),
        ])
        fireEvent.click(screen.getByRole('tab', { name: /Aprobados/ }))
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
        const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
        // At least one per-card approve button
        expect(approveBtns.length).toBeGreaterThanOrEqual(1)
    })

    it('does NOT show per-card "Aprobar" button for already-approved moments', async () => {
        await renderWall([makePhotoMoment({ is_approved: true })])
        // The only Aprobar button might be the "Aprobar todos" header button with count 0
        // Per-card Aprobar should not exist
        const approveBtns = screen.queryAllByRole('button', { name: /^Aprobar$/i })
        expect(approveBtns).toHaveLength(0)
    })

    it('clicking per-card Aprobar calls api.put with is_approved: true', async () => {
        const moment = makeMoment({ is_approved: false })
        await renderWall([moment])
        // Find the per-card approve button (not the bulk toolbar ones)
        const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
        const cardBtn = approveBtns.find(btn =>
            !btn.textContent?.includes('todos') &&
            !btn.textContent?.includes('(') &&
            !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
        )
        expect(cardBtn).toBeTruthy()
        await act(async () => {
            fireEvent.click(cardBtn!)
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
        const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
        const cardBtn = approveBtns.find(btn =>
            !btn.textContent?.includes('todos') &&
            !btn.textContent?.includes('(') &&
            !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
        )
        await act(async () => {
            fireEvent.click(cardBtn!)
        })
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Momento aprobado')
        })
    })

    it('shows error toast when approve fails', async () => {
        vi.mocked(api.put).mockRejectedValueOnce(new Error('Network error'))
        const { toast } = await import('sonner')
        await renderWall([makeMoment({ is_approved: false })])
        const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
        const cardBtn = approveBtns.find(btn =>
            !btn.textContent?.includes('todos') &&
            !btn.textContent?.includes('(') &&
            !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
        )
        await act(async () => {
            fireEvent.click(cardBtn!)
        })
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Error al aprobar el momento')
        })
    })
})

describe('MomentsWall — delete action', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock window.confirm to always return true — must be set before each test
        window.confirm = vi.fn().mockReturnValue(true)
    })

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
        // Next.js Image wraps src with /_next/image, so check the original URL is embedded
        expect(img.getAttribute('src')).toContain('photo.jpg')
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
        expect(screen.getByText('Error al procesar')).toBeInTheDocument()
    })

    it('shows description chip when moment has media and a description', async () => {
        await renderWall([makePhotoMoment({ description: 'Nota del invitado' })])
        expect(screen.getByText('Nota del invitado')).toBeInTheDocument()
    })
})

describe('MomentsWall — media type filters', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows Fotos and Videos filter tabs when approved photos/videos exist', async () => {
        await renderWall([
            makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' }),
            makeMoment({ id: 'v1', is_approved: true, content_url: 'https://cdn.example.com/clip.mp4' }),
        ])
        expect(screen.getByRole('tab', { name: /Fotos/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Videos/ })).toBeInTheDocument()
    })

    it('Fotos filter shows only photo moments', async () => {
        await renderWall([
            makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg', description: 'Una foto bonita' }),
            makeMoment({ id: 'v1', is_approved: true, content_url: 'https://cdn.example.com/clip.mp4', description: 'Un video genial' }),
        ])
        fireEvent.click(screen.getByRole('tab', { name: /Fotos/ }))
        await waitFor(() => {
            // Photo card's image must be visible
            const img = screen.getByRole('img', { name: /momento del evento/i })
            expect(img.getAttribute('src')).toContain('photo.jpg')
        })
        // Video card must not be rendered
        const allImgs = screen.getAllByRole('img', { name: /momento del evento/i })
        expect(allImgs).toHaveLength(1)
        expect(allImgs[0].getAttribute('src')).not.toContain('clip.mp4')
    })
})

describe('MomentsWall — QR modal', () => {

    beforeEach(() => vi.clearAllMocks())

    it('opens QR modal on button click', async () => {
        await renderWall([makeMoment()])
        fireEvent.click(screen.getByTitle('Generar QR para subida compartida'))
        await waitFor(() => {
            expect(screen.getByTestId('branded-qr')).toBeInTheDocument()
        })
    })

    it('shows Abrir enlace link in QR modal', async () => {
        await renderWall([makeMoment()])
        fireEvent.click(screen.getByTitle('Generar QR para subida compartida'))
        await waitFor(() => {
            const link = screen.getByRole('link', { name: /Abrir enlace/i })
            expect(link).toBeInTheDocument()
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })
    })

    it('shows tab bar in WallShareModal', async () => {
        await renderWall([makeMoment()])
        // Click the "Compartir muro" button (ShareIcon button with title="Compartir muro de momentos")
        fireEvent.click(screen.getByTitle('Compartir muro de momentos'))
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Ver muro/i })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /Subir fotos/i })).toBeInTheDocument()
        })
    })
})

describe('MomentsWall — multi-select', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        window.confirm = vi.fn().mockReturnValue(true)
    })

    it('shows a Seleccionar toggle button', async () => {
        await renderWall([makeMoment()])
        expect(screen.getByTitle('Seleccionar momentos')).toBeInTheDocument()
    })

    it('entering select mode shows "Seleccionar todo" label', async () => {
        await renderWall([makeMoment()])
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        await waitFor(() => {
            // "Seleccionar todo" text is hidden on mobile (hidden sm:inline) but still in the DOM
            expect(screen.getByText('Seleccionar todo')).toBeInTheDocument()
        })
    })

    it('select mode toggle button changes title to Cancelar selección when active', async () => {
        await renderWall([makeMoment()])
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        await waitFor(() => {
            expect(screen.getByTitle('Cancelar selección')).toBeInTheDocument()
        })
    })

    it('shows bulk action buttons when items are selected via Seleccionar todo', async () => {
        await renderWall([
            makeMoment({ id: 'm1', is_approved: false }),
            makeMoment({ id: 'm2', is_approved: false }),
        ])
        // Enter select mode
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        // Check "Seleccionar todo" checkbox
        await waitFor(() => expect(screen.getByText('Seleccionar todo')).toBeInTheDocument())
        const checkbox = screen.getByRole('checkbox')
        fireEvent.click(checkbox)
        await waitFor(() => {
            // Multiple buttons may exist (mobile + desktop) — check at least one is present
            expect(screen.getAllByRole('button', { name: /Aprobar selección/i })[0]).toBeInTheDocument()
            expect(screen.getAllByRole('button', { name: /Eliminar selección/i })[0]).toBeInTheDocument()
        })
    })

    it('exiting select mode hides Seleccionar todo and clears selection', async () => {
        await renderWall([makeMoment({ id: 'm1', is_approved: false })])
        // Enter select mode
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        await waitFor(() => expect(screen.getByText('Seleccionar todo')).toBeInTheDocument())
        // Select all
        fireEvent.click(screen.getByRole('checkbox'))
        // Exit select mode
        await waitFor(() => expect(screen.getByTitle('Cancelar selección')).toBeInTheDocument())
        fireEvent.click(screen.getByTitle('Cancelar selección'))
        await waitFor(() => {
            expect(screen.queryByText('Seleccionar todo')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Aprobar selección/i })).not.toBeInTheDocument()
        })
    })

    it('Aprobar selección calls api.put for each selected unapproved moment', async () => {
        const m1 = makeMoment({ id: 'sel-001', is_approved: false })
        const m2 = makeMoment({ id: 'sel-002', is_approved: false })
        await renderWall([m1, m2])
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        await waitFor(() => expect(screen.getByText('Seleccionar todo')).toBeInTheDocument())
        fireEvent.click(screen.getByRole('checkbox'))
        await waitFor(() => expect(screen.getAllByRole('button', { name: /Aprobar selección/i })[0]).toBeInTheDocument())
        await act(async () => {
            fireEvent.click(screen.getAllByRole('button', { name: /Aprobar selección/i })[0])
        })
        await waitFor(() => {
            expect(vi.mocked(api.put)).toHaveBeenCalledWith('/moments/sel-001', expect.objectContaining({ is_approved: true }))
            expect(vi.mocked(api.put)).toHaveBeenCalledWith('/moments/sel-002', expect.objectContaining({ is_approved: true }))
        })
    })

    it('Eliminar selección calls api.delete for each selected moment', async () => {
        const m1 = makeMoment({ id: 'del-001', is_approved: false })
        const m2 = makeMoment({ id: 'del-002', is_approved: false })
        await renderWall([m1, m2])
        fireEvent.click(screen.getByTitle('Seleccionar momentos'))
        await waitFor(() => expect(screen.getByText('Seleccionar todo')).toBeInTheDocument())
        fireEvent.click(screen.getByRole('checkbox'))
        await waitFor(() => expect(screen.getAllByRole('button', { name: /Eliminar selección/i })[0]).toBeInTheDocument())
        await act(async () => {
            fireEvent.click(screen.getAllByRole('button', { name: /Eliminar selección/i })[0])
        })
        await waitFor(() => {
            expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/moments/del-001')
            expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/moments/del-002')
        })
    })
})

describe('MomentsWall — lightbox note display', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows guest description in lightbox when moment has a note', async () => {
        const moment = makePhotoMoment({ description: 'Una nota especial del invitado' })
        await renderWall([moment])
        // Click the image to open the lightbox
        const img = screen.getByRole('img', { name: /momento del evento/i })
        fireEvent.click(img)
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })
        // The note block uses backdrop-blur-md (full note design, not the old pill)
        const noteContainer = document.querySelector('.backdrop-blur-md')
        expect(noteContainer).toBeInTheDocument()
        expect(noteContainer).toHaveTextContent('Una nota especial del invitado')
    })

    it('does not show note section in lightbox when moment has no description', async () => {
        const moment = makePhotoMoment({ description: '' })
        await renderWall([moment])
        // Click the image to open the lightbox
        const img = screen.getByRole('img', { name: /momento del evento/i })
        fireEvent.click(img)
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })
        // There should be no ChatBubbleOvalLeftIcon note container
        // We verify by checking no element with the note wrapper exists
        // The note div has class containing "backdrop-blur-md" only in the note block
        const noteContainers = document.querySelectorAll('.backdrop-blur-md')
        expect(noteContainers).toHaveLength(0)
    })
})

describe('MomentsWall — time grouping', () => {

  beforeEach(() => vi.clearAllMocks())

  it('shows a "Agrupar por hora" toggle button', async () => {
    await renderWall([makeMoment()])
    expect(screen.getByTitle('Agrupar por hora')).toBeInTheDocument()
  })

  it('groupByTime toggle shows time bucket labels', async () => {
    const moments = [
      makeMoment({ id: 'm1', created_at: '2026-08-15T20:15:00Z' }),
      makeMoment({ id: 'm2', created_at: '2026-08-15T21:45:00Z' }),
    ]
    await renderWall(moments)
    fireEvent.click(screen.getByTitle('Agrupar por hora'))
    await waitFor(() => {
      // Each moment falls in a different 30-min bucket; expect labels in HH:MM format
      const allText = document.body.textContent ?? ''
      // 20:00 bucket for 20:15, 21:30 bucket for 21:45
      expect(allText).toMatch(/\d{2}:\d{2}/)
    })
  })
})

describe('MomentsWall — filter tabs scroll', () => {

    beforeEach(() => vi.clearAllMocks())

    // Intentional: className coupling is acceptable here — overflow-x-auto is the mechanism
    // that enables horizontal scroll on mobile. If the implementation changes, update this test.
    it('tablist has overflow-x-auto class for horizontal scroll', async () => {
        await renderWall([])
        const tablist = screen.getByRole('tablist')
        expect(tablist.className).toContain('overflow-x-auto')
    })

    // Intentional: flex-shrink-0 prevents tabs from compressing on mobile.
    // If Tailwind class strategy changes, update this test accordingly.
    it('each tab has flex-shrink-0 so it does not compress', async () => {
        await renderWall([])
        const tabs = screen.getAllByRole('tab')
        tabs.forEach(tab => expect(tab.className).toContain('flex-shrink-0'))
    })
})

describe('MomentsWall — ZIP split dropdown', () => {

    beforeEach(() => vi.clearAllMocks())

    it('shows a dropdown arrow button next to the ZIP button when approved moments exist', async () => {
        await renderWall([
            makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' }),
        ])
        expect(screen.getByTitle('Opciones de descarga')).toBeInTheDocument()
    })

    it('clicking the arrow button opens the ZIP menu with all three options', async () => {
        await renderWall([
            makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' }),
        ])
        fireEvent.click(screen.getByTitle('Opciones de descarga'))
        await waitFor(() => {
            expect(screen.getByText('Solo fotos')).toBeInTheDocument()
            expect(screen.getByText('Solo vídeos')).toBeInTheDocument()
        })
    })

    it('clicking Solo fotos closes the menu and initiates download (does not show no-content toast)', async () => {
        const { toast } = await import('sonner')
        const photoMoment = makeMoment({ id: 'photo-only', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' })
        const videoMoment = makeMoment({ id: 'video-only', is_approved: true, content_url: 'https://cdn.example.com/clip.mp4' })
        await renderWall([photoMoment, videoMoment])
        // Open menu
        fireEvent.click(screen.getByTitle('Opciones de descarga'))
        await waitFor(() => expect(screen.getByText('Solo fotos')).toBeInTheDocument())
        // Click the Solo fotos button
        const soloFotosBtn = screen.getByText('Solo fotos').closest('button')!
        await act(async () => {
            fireEvent.click(soloFotosBtn)
        })
        // Menu should close (setShowZipMenu(false) is called inside handleDownloadZip)
        await waitFor(() => {
            expect(screen.queryByText('Solo fotos')).not.toBeInTheDocument()
        })
        // The "no approved" toast should NOT fire because there IS a photo moment
        expect(toast.info).not.toHaveBeenCalledWith('No hay momentos aprobados para descargar')
    })
})

describe('MomentsWall — BottomSheet contents', () => {

    beforeEach(() => vi.clearAllMocks())

    it('clicking Más acciones button opens bottom sheet with QR and publish rows', async () => {
        await renderWall([makeMoment()])

        // Click the "Más acciones" button (mobile toolbar)
        const moreButton = screen.getByRole('button', { name: /Más acciones/i })
        await act(async () => {
            fireEvent.click(moreButton)
        })

        // Sheet should show key rows (some labels also exist in the desktop toolbar,
        // so use getAllByText and verify at least one match is present)
        await waitFor(() => {
            expect(screen.getByText('QR de carga')).toBeInTheDocument()
            expect(screen.getAllByText('Publicar muro').length).toBeGreaterThanOrEqual(1)
            expect(screen.getAllByText('Compartir muro').length).toBeGreaterThanOrEqual(1)
        })
    })
})
