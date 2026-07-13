/**
 * moments-wall.test.tsx
 * Unit tests for MomentsWall component — filter tabs, approve/delete actions,
 * processing status badges, and empty states.
 */

import type { Moment } from '@/models/Moment'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('swr', () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('swr/infinite', () => ({ default: vi.fn() }))

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    quality: _quality,
    ...props
  }: any) => <img src={typeof src === 'string' ? src : (src?.src ?? '')} alt={alt ?? ''} {...props} />,
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: new Blob() }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn().mockReturnValue('download-progress'),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock qrcode.react so it doesn't render real QR in tests
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value} />,
  QRCodeCanvas: ({ id, value }: { id?: string; value: string }) => (
    <canvas id={id} data-testid="qr-canvas" data-value={value} />
  ),
}))

// Mock JSZip
vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      folder: vi.fn().mockReturnThis(),
      file: vi.fn(),
      generateAsync: vi.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' })),
    }
  }),
}))

// Mock BrandedQR
vi.mock('@/components/ui/branded-qr', () => ({
  BrandedQR: ({ value }: { value: string }) => <div data-testid="branded-qr" data-value={value} />,
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const makeMoment = (overrides: Partial<Moment> = {}): Moment =>
  ({
    id: 'moment-001',
    description: 'Felicidades!',
    is_approved: false,
    processing_status: 'done',
    content_url: '',
    created_at: '2026-01-15T12:00:00Z',
    event_id: 'evt-001',
    ...overrides,
  }) as Moment

const makePhotoMoment = (overrides: Partial<Moment> = {}): Moment =>
  makeMoment({
    id: 'moment-photo-001',
    content_url: 'https://cdn.example.com/photo.jpg',
    ...overrides,
  })

// ── Helpers ───────────────────────────────────────────────────────────────────

import { api } from '@/lib/api'
import useSWR, { mutate as globalMutate } from 'swr'
import useSWRInfinite from 'swr/infinite'

function mockSWR(data: Moment[] = [], isLoading = false) {
  const empty = { data: [], isLoading: false, error: undefined, isValidating: false, mutate: vi.fn() }
  vi.mocked(useSWR).mockImplementation((key) => {
    const k = typeof key === 'function' ? key() : key
    if (typeof k === 'string' && (k.includes('/moments/activity') || k.includes('/moments/summary')))
      return { ...empty, data: { in_flight: [], reoptimizing: [] } } as ReturnType<typeof useSWR>
    return { data, isLoading, error: undefined, isValidating: false, mutate: vi.fn() } as ReturnType<typeof useSWR>
  })
  const counts = {
    total: data.length,
    pending: data.filter((moment) => !moment.is_approved && moment.processing_status !== 'failed').length,
    approved: data.filter((moment) => moment.is_approved).length,
    failed: data.filter((moment) => moment.processing_status === 'failed').length,
    photos: data.filter(
      (moment) =>
        moment.is_approved &&
        !moment.content_type?.startsWith('video/') &&
        !/\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(moment.content_view_url || moment.content_url || '')
    ).length,
    videos: data.filter(
      (moment) =>
        moment.is_approved &&
        (moment.content_type?.startsWith('video/') ||
          /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(moment.content_view_url || moment.content_url || ''))
    ).length,
    notes: data.filter((moment) => Boolean(moment.description?.trim())).length,
    legacy: data.filter((moment) => !moment.processing_status).length,
  }
  const mutate = vi.fn((...args: unknown[]) => globalMutate('/moments?event_id=evt-001', ...args))
  vi.mocked(useSWRInfinite).mockReturnValue({
    data: isLoading
      ? undefined
      : [{ data, total: data.length, page: 1, page_size: 40, total_pages: data.length ? 1 : 0, counts }],
    isLoading,
    isValidating: false,
    error: undefined,
    size: 1,
    setSize: vi.fn(),
    mutate,
  } as unknown as ReturnType<typeof useSWRInfinite>)
}

type MomentsWallProps = ComponentProps<typeof import('@/components/events/moments-wall').MomentsWall>

async function renderWall(moments: Moment[] = [], isLoading = false, props: Partial<MomentsWallProps> = {}) {
  mockSWR(moments, isLoading)
  const { MomentsWall } = await import('@/components/events/moments-wall')
  render(
    <MomentsWall
      eventId="evt-001"
      eventIdentifier="evento-test"
      eventName="Evento Test"
      shareUploadsEnabled
      allowUploadsEnabled
      momentsWallPublished={false}
      {...props}
    />
  )
}

async function confirmAlert(label: RegExp) {
  const button = await screen.findByRole('button', { name: label })
  await act(async () => {
    fireEvent.click(button)
  })
}

describe('MomentsWall - live refresh policy', () => {
  it('does not poll the dashboard list for inactive or past events', async () => {
    await renderWall([], false, { liveRefreshEnabled: false })

    const options = vi.mocked(useSWRInfinite).mock.calls.at(-1)?.[2]
    expect(options?.refreshInterval).toBe(0)
  })

  it('polls while a live event is active and visible', async () => {
    await renderWall([], false, { liveRefreshEnabled: true })

    const options = vi.mocked(useSWRInfinite).mock.calls.at(-1)?.[2]
    expect(options?.refreshInterval).toBe(15_000)
  })
})

describe('MomentsWall - signed media refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('revalidates the moments list before signed media URLs expire', async () => {
    await renderWall([
      makePhotoMoment({
        content_url: 'moments/event-001/raw/photo.jpg',
        content_view_url: 'https://signed.example.com/photo.jpg',
        content_view_url_expires_at: '2026-01-01T12:02:00Z',
      }),
    ])

    expect(globalMutate).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(59_999)
    })
    expect(globalMutate).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(globalMutate).toHaveBeenCalledWith('/moments?event_id=evt-001')
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MomentsWall — loading state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders skeleton cards while loading', async () => {
    await renderWall([], true)
    const skeletons = document.querySelectorAll('.skeleton')
    expect(skeletons.length).toBe(8)
  })
})

describe('MomentsWall - failed moment retry routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requeues failed raw uploads through the single-moment endpoint', async () => {
    await renderWall([
      makeMoment({
        id: 'failed-raw',
        processing_status: 'failed',
        content_url: 'moments/event-001/raw/photo.jpg',
        content_type: 'image/jpeg',
      }),
    ])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^retry$/i }))
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/moments/failed-raw/requeue', {})
      expect(vi.mocked(api.post)).not.toHaveBeenCalledWith('/moments/batch/reoptimize', expect.anything())
      expect(vi.mocked(globalMutate)).toHaveBeenCalledWith('/moments?event_id=evt-001')
    })
  })

  it('reoptimizes failed non-raw moments through the batch endpoint', async () => {
    await renderWall([
      makeMoment({
        id: 'failed-optimized',
        processing_status: 'failed',
        content_url: 'moments/event-001/optimized/photo.webp',
        content_type: 'image/webp',
        optimized_size_bytes: 2048,
      }),
    ])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^retry$/i }))
    })

    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/moments/batch/reoptimize', {
        ids: ['failed-optimized'],
      })
      expect(vi.mocked(api.put)).not.toHaveBeenCalledWith('/moments/failed-optimized/requeue', {})
    })
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
    const pendingTab = screen.getByRole('button', { name: /Pendientes/ })
    fireEvent.click(pendingTab)
    await waitFor(() => {
      expect(screen.getByText(/No hay momentos pendientes/)).toBeInTheDocument()
    })
  })

  it('shows approved-specific empty state when approved filter active', async () => {
    await renderWall([makeMoment({ is_approved: false })])
    const approvedTab = screen.getByRole('button', { name: /Aprobados/ })
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
    await renderWall([makeMoment({ id: 'm1', is_approved: false }), makeMoment({ id: 'm2', is_approved: false })])
    expect(screen.getByText(/2 pendiente/)).toBeInTheDocument()
  })

  it('does not show pending badge when all moments are approved', async () => {
    await renderWall([makePhotoMoment({ is_approved: true })])
    // The header text should not mention "pendiente"
    const headerInfo = screen.queryByText(/\d+ pendiente/)
    expect(headerInfo).not.toBeInTheDocument()
  })

  it('shows when moment uploads are auto-approved', async () => {
    await renderWall([makePhotoMoment({ is_approved: true })], false, { autoApproveUploads: true })
    expect(screen.getByText('Auto-aprobación activa')).toBeInTheDocument()
  })

  it('shows QR button when share uploads enabled', async () => {
    await renderWall([makeMoment()])
    // Button has title "Generar QR para subida compartida"
    expect(screen.getByTitle('Generar QR para subida compartida')).toBeInTheDocument()
  })

  it('keeps shared QR uploads closed until backend config confirms the upload gate', async () => {
    await renderWall([], false, {
      shareUploadsEnabled: undefined,
      allowUploadsEnabled: undefined,
      momentsWallPublished: undefined,
    })

    expect(screen.queryByTitle('Generar QR para subida compartida')).not.toBeInTheDocument()
    const qrToggles = screen.getAllByRole('button', { name: /Habilitar subida QR/i })
    expect(qrToggles.some((button) => button.hasAttribute('disabled'))).toBe(true)
  })
})

describe('MomentsWall — filter tabs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders all three filter tabs', async () => {
    await renderWall([])
    expect(screen.getByRole('button', { name: /Todos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pendientes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprobados/ })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /Pendientes/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /Aprobados/ }))
    await waitFor(() => {
      expect(screen.queryByText(/Pendiente de Ana/)).not.toBeInTheDocument()
      expect(screen.getByText(/Aprobado de Carlos/)).toBeInTheDocument()
    })
  })
})

describe('MomentsWall — progressive notes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mounts notes in the same progressive window as media cards', async () => {
    const notes = Array.from({ length: 45 }, (_, index) =>
      makeMoment({ id: `note-${index + 1}`, description: `Nota ${index + 1}` })
    )
    await renderWall(notes)

    fireEvent.click(screen.getByRole('button', { name: /Notas/ }))

    await waitFor(() => expect(screen.getAllByTestId('moment-note-card')).toHaveLength(40))
    fireEvent.click(screen.getByRole('button', { name: /Mostrar 5 m.s/ }))
    await waitFor(() => expect(screen.getAllByTestId('moment-note-card')).toHaveLength(45))
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
    const cardBtn = approveBtns.find(
      (btn) =>
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
        expect.objectContaining({ is_approved: true })
      )
    })
  })

  it('notifies public content refresh after approving a moment', async () => {
    const onPublicContentChanged = vi.fn()
    await renderWall([makeMoment({ is_approved: false })], false, { onPublicContentChanged })

    const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
    const cardBtn = approveBtns.find(
      (btn) =>
        !btn.textContent?.includes('todos') &&
        !btn.textContent?.includes('(') &&
        !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
    )

    await act(async () => {
      fireEvent.click(cardBtn!)
    })

    await waitFor(() => {
      expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
    })
  })

  it('updates SWR from the backend approval response without a full list refetch', async () => {
    const moment = makeMoment({ id: 'moment-live', is_approved: false, description: 'Antes' })
    vi.mocked(api.put).mockResolvedValueOnce({
      data: makeMoment({ id: 'moment-live', is_approved: true, description: 'Desde backend' }),
    })
    await renderWall([moment])

    const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
    const cardBtn = approveBtns.find(
      (btn) =>
        !btn.textContent?.includes('todos') &&
        !btn.textContent?.includes('(') &&
        !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
    )
    await act(async () => {
      fireEvent.click(cardBtn!)
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/moments/moment-live', { is_approved: true })
    })

    const momentMutations = vi.mocked(globalMutate).mock.calls.filter(([key]) => key === '/moments?event_id=evt-001')
    expect(momentMutations).toHaveLength(2)
    expect(momentMutations.every((call) => call.length === 3)).toBe(true)

    const responseUpdater = momentMutations[1][1]
    expect(typeof responseUpdater).toBe('function')
    const currentPage = {
      data: [moment],
      total: 1,
      page: 1,
      page_size: 40,
      total_pages: 1,
      counts: { total: 1, pending: 1, approved: 0, failed: 0, photos: 0, videos: 0, notes: 1, legacy: 0 },
    }
    expect((responseUpdater as (current: unknown) => unknown)([currentPage])).toEqual([
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 'moment-live',
            is_approved: true,
            description: 'Desde backend',
          }),
        ],
      }),
    ])
  })

  it('shows success toast after approving', async () => {
    const { toast } = await import('sonner')
    await renderWall([makeMoment({ is_approved: false })])
    const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
    const cardBtn = approveBtns.find(
      (btn) =>
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

  it('shows backend error toast when approve fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({
      response: { data: { error: 'No tienes permiso para aprobar este momento' } },
    })
    const { toast } = await import('sonner')
    await renderWall([makeMoment({ is_approved: false })])
    const approveBtns = screen.getAllByRole('button', { name: /Aprobar/i })
    const cardBtn = approveBtns.find(
      (btn) =>
        !btn.textContent?.includes('todos') &&
        !btn.textContent?.includes('(') &&
        !btn.getAttribute('aria-label')?.toLowerCase().includes('todos')
    )
    await act(async () => {
      fireEvent.click(cardBtn!)
    })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No tienes permiso para aprobar este momento')
    })
  })
})

describe('MomentsWall — delete action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(vi.mocked(api.delete)).not.toHaveBeenCalled()
    await confirmAlert(/^Eliminar momentos$/i)
    await waitFor(() => {
      expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/moments/moment-xyz')
    })
  })

  it('notifies public content refresh after deleting a moment', async () => {
    const onPublicContentChanged = vi.fn()
    await renderWall([makeMoment({ id: 'moment-delete-public' })], false, { onPublicContentChanged })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
    })
    await confirmAlert(/^Eliminar momentos$/i)

    await waitFor(() => {
      expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
    })
  })

  it('shows success toast after deleting', async () => {
    const { toast } = await import('sonner')
    await renderWall([makeMoment()])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
    })
    await confirmAlert(/^Eliminar momentos$/i)
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Momento eliminado')
    })
  })

  it('shows backend error toast when delete fails', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce({
      response: { data: { detail: 'El momento ya fue eliminado' } },
    })
    const { toast } = await import('sonner')
    await renderWall([makeMoment()])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))
    })
    await confirmAlert(/^Eliminar momentos$/i)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('El momento ya fue eliminado')
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

  it('prefers content_view_url when rendering media', async () => {
    await renderWall([
      makePhotoMoment({
        is_approved: true,
        content_url: 'moments/event-001/raw/photo.jpg',
        content_view_url: 'https://cdn.example.com/signed-photo.webp',
      }),
    ])
    const img = screen.getByRole('img', { name: /momento del evento/i })
    expect(img.getAttribute('src')).toContain('signed-photo.webp')
    expect(img.getAttribute('src')).not.toContain('raw/photo.jpg')
  })

  it('prefers thumbnail_view_url for video previews', async () => {
    await renderWall([
      makeMoment({
        id: 'video-signed-thumb',
        is_approved: true,
        content_url: 'moments/event-001/raw/video.mp4',
        content_view_url: 'https://cdn.example.com/signed-video.mp4',
        thumbnail_url: 'moments/event-001/raw/thumb.jpg',
        thumbnail_view_url: 'https://cdn.example.com/signed-thumb.webp',
        content_type: 'video/mp4',
      }),
    ])

    const img = screen.getByRole('img', { name: /video momento/i })
    expect(img.getAttribute('src')).toContain('signed-thumb.webp')
    expect(img.getAttribute('src')).not.toContain('raw/thumb.jpg')
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

  it('shows failed moment in FailedSection instead of main grid', async () => {
    await renderWall([makeMoment({ processing_status: 'failed' })])
    expect(screen.getByText('Fallidos (1)')).toBeInTheDocument()
  })

  it('shows worker duration for failed moments', async () => {
    await renderWall([
      makeMoment({
        processing_status: 'failed',
        error_message: 'timeout from optimizer',
        processing_duration_ms: 1234,
      }),
    ])
    expect(screen.getByText('timeout from optimizer')).toBeInTheDocument()
    expect(screen.getByText('Tiempo: 1.2 s')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Fotos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Videos/ })).toBeInTheDocument()
  })

  it('loads the next page instead of showing an empty state when the selected filter has remote results', async () => {
    const photo = makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' })
    mockSWR([photo])
    const setSize = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSWRInfinite).mockReturnValue({
      data: [
        {
          data: [photo],
          total: 80,
          page: 1,
          page_size: 40,
          total_pages: 2,
          counts: { total: 80, pending: 0, approved: 80, failed: 0, photos: 79, videos: 1, notes: 0, legacy: 0 },
        },
      ],
      isLoading: false,
      isValidating: false,
      error: undefined,
      size: 1,
      setSize,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSWRInfinite>)
    const { MomentsWall } = await import('@/components/events/moments-wall')
    render(
      <MomentsWall
        eventId="evt-001"
        eventIdentifier="evento-test"
        eventName="Evento Test"
        shareUploadsEnabled
        allowUploadsEnabled
        momentsWallPublished={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Videos/ }))

    expect(await screen.findByRole('status')).toHaveTextContent('Buscando resultados')
    expect(screen.queryByText('Sin momentos')).not.toBeInTheDocument()
    await waitFor(() => expect(setSize).toHaveBeenCalledTimes(1))
    expect(typeof setSize.mock.calls[0][0]).toBe('function')
  })

  it('Fotos filter shows only photo moments', async () => {
    await renderWall([
      makeMoment({
        id: 'p1',
        is_approved: true,
        content_url: 'https://cdn.example.com/photo.jpg',
        description: 'Una foto bonita',
      }),
      makeMoment({
        id: 'v1',
        is_approved: true,
        content_url: 'https://cdn.example.com/clip.mp4',
        description: 'Un video genial',
      }),
    ])
    fireEvent.click(screen.getByRole('button', { name: /Fotos/ }))
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

  it('opens the shared upload preview with a signed preview token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        status: 200,
        data: {
          token: ' preview/123 ',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      },
    })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    await renderWall([makeMoment()])
    fireEvent.click(screen.getByTitle('Abrir preview de subida en nueva pestaña'))

    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/events/evt-001/preview-token')
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('/events/evento-test/upload?preview=1'),
        '_blank',
        'noopener,noreferrer'
      )
      expect(String(openSpy.mock.calls[0][0])).toContain('preview_token=preview%2F123')
    })

    openSpy.mockRestore()
  })

  it('does not expose public wall sharing while the wall is hidden', async () => {
    await renderWall([makeMoment()])

    expect(screen.queryByTitle('Compartir muro de momentos')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Ver el muro de momentos en eventiapp')).not.toBeInTheDocument()
  })

  it('opens the wall share modal only for published walls', async () => {
    await renderWall([makeMoment()], false, { momentsWallPublished: true })

    fireEvent.click(screen.getByTitle('Compartir muro de momentos'))

    await waitFor(() => {
      expect(screen.getByTestId('branded-qr')).toHaveAttribute(
        'data-value',
        expect.stringContaining('/e/evento-test/momentos')
      )
      const link = screen.getByRole('link', { name: /Abrir enlace/i })
      expect(link).toHaveAttribute('href', expect.stringContaining('/e/evento-test/momentos'))
    })
    expect(screen.queryByRole('button', { name: /Subir fotos/i })).not.toBeInTheDocument()
  })

  it('does not offer upload sharing from the wall share modal when published walls close uploads', async () => {
    await renderWall([makeMoment()], false, {
      shareUploadsEnabled: true,
      allowUploadsEnabled: true,
      momentsWallPublished: true,
    })

    fireEvent.click(screen.getByTitle('Compartir muro de momentos'))

    await waitFor(() => {
      expect(screen.getByTestId('branded-qr')).toHaveAttribute(
        'data-value',
        expect.stringContaining('/e/evento-test/momentos')
      )
    })
    expect(screen.queryByRole('button', { name: /Subir fotos/i })).not.toBeInTheDocument()
  })
})

describe('MomentsWall — shared upload config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('enabling shared QR uploads also enables the backend upload gate', async () => {
    const onPublicContentChanged = vi.fn()
    await renderWall([], false, {
      shareUploadsEnabled: false,
      allowUploadsEnabled: false,
      onPublicContentChanged,
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Habilitar subida QR/i }))
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/events/evt-001/config', {
        share_uploads_enabled: true,
        allow_uploads: true,
        show_moment_wall: false,
      })
    })
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
  })

  it('disabling shared QR uploads leaves allow_uploads unchanged', async () => {
    await renderWall([], false, { shareUploadsEnabled: true, allowUploadsEnabled: true })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Subida QR activa/i }))
    })

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/events/evt-001/config', {
        share_uploads_enabled: false,
      })
    })
  })

  it('shows configured shared QR uploads as closed while the wall is published', async () => {
    await renderWall([], false, {
      shareUploadsEnabled: true,
      allowUploadsEnabled: true,
      momentsWallPublished: true,
    })

    const qrButton = screen.getByRole('button', { name: /QR cerrado por muro publicado/i })
    expect(qrButton).toBeDisabled()

    fireEvent.click(qrButton)

    expect(vi.mocked(api.put)).not.toHaveBeenCalled()
  })

  it('publishing the wall sends the normalized config that closes shared QR uploads', async () => {
    const onPublicContentChanged = vi.fn()
    await renderWall([], false, {
      shareUploadsEnabled: true,
      allowUploadsEnabled: true,
      momentsWallPublished: false,
      onPublicContentChanged,
    })

    await act(async () => {
      fireEvent.click(screen.getByTitle('Publicar muro para invitados'))
    })
    expect(vi.mocked(api.put)).not.toHaveBeenCalled()
    await confirmAlert(/^Publicar muro$/i)

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalledWith('/events/evt-001/config', {
        show_moment_wall: true,
        share_uploads_enabled: false,
      })
    })
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
  })
})

describe('MomentsWall — multi-select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    await renderWall([makeMoment({ id: 'm1', is_approved: false }), makeMoment({ id: 'm2', is_approved: false })])
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
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/moments/bulk-approve', {
        ids: ['sel-001', 'sel-002'],
        is_approved: true,
      })
    })
  })

  it('refreshes all moment streams after bulk approval succeeds', async () => {
    const m1 = makeMoment({ id: 'bulk-refresh-001', is_approved: false })
    const m2 = makeMoment({ id: 'bulk-refresh-002', is_approved: false })
    const onPublicContentChanged = vi.fn()
    await renderWall([m1, m2], false, { onPublicContentChanged })
    fireEvent.click(screen.getByTitle('Seleccionar momentos'))
    await waitFor(() => expect(screen.getByText('Seleccionar todo')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Aprobar selecci.n/i })[0]).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Aprobar selecci.n/i })[0])
    })

    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/moments/bulk-approve', {
        ids: ['bulk-refresh-001', 'bulk-refresh-002'],
        is_approved: true,
      })
    })

    const refreshedKeys = vi
      .mocked(globalMutate)
      .mock.calls.filter((call) => call.length === 1)
      .map(([key]) => key)
    expect(refreshedKeys).toContain('/moments?event_id=evt-001')
    expect(refreshedKeys).not.toContain('/moments/activity?event_id=evt-001')
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
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
    await confirmAlert(/^Eliminar momentos$/i)
    await waitFor(() => {
      expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/moments/bulk', {
        data: { ids: ['del-001', 'del-002'] },
      })
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

  it('exposes media cards as keyboard-operable viewer controls', async () => {
    await renderWall([makePhotoMoment()])
    const openPhoto = screen.getByRole('button', { name: 'Abrir foto en el visor' })

    openPhoto.focus()
    expect(openPhoto).toHaveFocus()
    fireEvent.click(openPhoto)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
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

describe('MomentsWall — filter controls scroll', () => {
  beforeEach(() => vi.clearAllMocks())

  // Intentional: className coupling is acceptable here — overflow-x-auto is the mechanism
  // that enables horizontal scroll on mobile. If the implementation changes, update this test.
  it('filter group has overflow-x-auto class for horizontal scroll', async () => {
    await renderWall([])
    const filterGroup = screen.getByRole('group', { name: 'Filtrar momentos' })
    expect(filterGroup.className).toContain('overflow-x-auto')
  })

  // Intentional: flex-shrink-0 prevents tabs from compressing on mobile.
  // If Tailwind class strategy changes, update this test accordingly.
  it('each filter has flex-shrink-0 so it does not compress', async () => {
    await renderWall([])
    const filters = within(screen.getByRole('group', { name: 'Filtrar momentos' })).getAllByRole('button')
    filters.forEach((filter) => expect(filter.className).toContain('flex-shrink-0'))
  })
})

describe('MomentsWall — ZIP split dropdown', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(function () {
      return Promise.resolve({
        blob: () => Promise.resolve(new Blob(['image'], { type: 'image/jpeg' })),
      } as Response)
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows a dropdown arrow button next to the ZIP button when approved moments exist', async () => {
    await renderWall([makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' })])
    expect(screen.getByTitle('Opciones de descarga')).toBeInTheDocument()
  })

  it('clicking the arrow button opens the ZIP menu with all three options', async () => {
    await renderWall([makeMoment({ id: 'p1', is_approved: true, content_url: 'https://cdn.example.com/photo.jpg' })])
    fireEvent.click(screen.getByTitle('Opciones de descarga'))
    await waitFor(() => {
      expect(screen.getByText('Solo fotos')).toBeInTheDocument()
      expect(screen.getByText('Solo vídeos')).toBeInTheDocument()
    })
  })

  it('clicking Solo fotos closes the menu and initiates download (does not show no-content toast)', async () => {
    const { toast } = await import('sonner')
    const photoMoment = makeMoment({
      id: 'photo-only',
      is_approved: true,
      content_url: 'https://cdn.example.com/photo.jpg',
    })
    const videoMoment = makeMoment({
      id: 'video-only',
      is_approved: true,
      content_url: 'https://cdn.example.com/clip.mp4',
    })
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

  it('clicking Más acciones button opens bottom sheet without public wall rows while hidden', async () => {
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
    })
    expect(screen.queryByText('Ver muro público')).not.toBeInTheDocument()
    expect(screen.queryByText('Compartir muro')).not.toBeInTheDocument()
  })

  it('shows public wall rows in the bottom sheet once the wall is published', async () => {
    await renderWall([makeMoment()], false, { momentsWallPublished: true })

    const moreButton = screen.getByRole('button', { name: /Más acciones/i })
    await act(async () => {
      fireEvent.click(moreButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Ver muro público')).toBeInTheDocument()
      expect(screen.getAllByText('Compartir muro').length).toBeGreaterThanOrEqual(1)
    })
  })
})
