/**
 * Reorder mode of the moments wall (MOM-1 / MOM-2): it opens with the wall
 * order, never saves on its own, never refetches in a loop, and saves only
 * after a user drag.
 */
import type { Moment } from '@/models/Moment'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('swr', () => ({ default: vi.fn(), mutate: vi.fn() }))
vi.mock('swr/infinite', () => ({ default: vi.fn() }))
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout: _layout, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _f, priority: _p, unoptimized: _u, quality: _q, ...props }: any) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...props} />
  ),
}))
vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub(props: Record<string, unknown>) {
      if ('onOrderChange' in props) return <DragGridStub {...(props as unknown as DragGridProps)} />
      return null
    },
}))
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))
vi.mock('sonner', () => ({
  toast: { loading: vi.fn().mockReturnValue('t'), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null, QRCodeCanvas: () => null }))
vi.mock('@/components/ui/branded-qr', () => ({ BrandedQR: () => null }))

interface DragGridProps {
  moments: Moment[]
  onOrderChange: (moments: Moment[]) => void
}

function DragGridStub({ moments, onOrderChange }: DragGridProps) {
  return (
    <div>
      <ol aria-label="Orden del muro">
        {moments.map((moment) => (
          <li key={moment.id}>{moment.id}</li>
        ))}
      </ol>
      <button type="button" onClick={() => onOrderChange([...moments].reverse())}>
        Simular arrastre
      </button>
    </div>
  )
}

import { api } from '@/lib/api'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'

const approved = (id: string, overrides: Partial<Moment> = {}): Moment =>
  ({
    id,
    event_id: 'evt-001',
    is_approved: true,
    processing_status: 'done',
    content_url: `https://cdn.example.com/${id}.jpg`,
    created_at: '2026-01-15T12:00:00Z',
    ...overrides,
  }) as Moment

// Dashboard list order: newest first. Wall order: b (1), c (2), a (3).
const dashboardList = [
  approved('a', { order: 3, created_at: '2026-01-17T00:00:00Z' }),
  approved('b', { order: 1, created_at: '2026-01-16T00:00:00Z' }),
  approved('c', { order: 2, created_at: '2026-01-15T00:00:00Z' }),
]

let pagesMutate: ReturnType<typeof vi.fn>

function mockData(list: Moment[]) {
  vi.mocked(useSWR).mockImplementation(
    () => ({ data: undefined, isLoading: false, error: undefined, isValidating: false, mutate: vi.fn() }) as never
  )
  pagesMutate = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useSWRInfinite).mockReturnValue({
    data: [
      {
        data: list,
        total: list.length,
        page: 1,
        page_size: 40,
        total_pages: 1,
        counts: { total: list.length, pending: 0, approved: list.length, failed: 0, photos: list.length, videos: 0, notes: 0, legacy: 0 },
        in_flight: [],
        reoptimizing: [],
      },
    ],
    isLoading: false,
    isValidating: false,
    error: undefined,
    size: 1,
    setSize: vi.fn(),
    mutate: pagesMutate,
  } as never)
}

async function renderWall() {
  const { MomentsWall } = await import('@/components/events/moments-wall')
  const utils = render(
    <MomentsWall
      eventId="evt-001"
      eventIdentifier="evento-test"
      eventName="Evento Test"
      shareUploadsEnabled
      allowUploadsEnabled
      momentsWallPublished
      canManage
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /Aprobados/ }))
  await act(async () => {
    fireEvent.click(screen.getByTitle('Reordenar momentos arrastrando'))
  })
  return utils
}

function wallOrder() {
  return Array.from(screen.getByRole('list', { name: 'Orden del muro' }).querySelectorAll('li')).map(
    (item) => item.textContent
  )
}

describe('MomentsWall reorder mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockData(dashboardList)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens with the wall order and saves nothing without a drag (MOM-1)', async () => {
    await renderWall()

    expect(wallOrder()).toEqual(['b', 'c', 'a'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(api.patch).not.toHaveBeenCalled()
    expect(pagesMutate).not.toHaveBeenCalled()
  })

  it('does not loop when a refetch brings new signed URLs (MOM-2)', async () => {
    const { rerender } = await renderWall()
    const { MomentsWall } = await import('@/components/events/moments-wall')

    for (let i = 0; i < 3; i += 1) {
      mockData(dashboardList.map((moment) => ({ ...moment, content_view_url: `https://signed/${moment.id}/${i}` })))
      rerender(
        <MomentsWall
          eventId="evt-001"
          eventIdentifier="evento-test"
          eventName="Evento Test"
          shareUploadsEnabled
          allowUploadsEnabled
          momentsWallPublished
          canManage
        />
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
    }

    expect(wallOrder()).toEqual(['b', 'c', 'a'])
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('saves the dragged order once and refetches only after leaving reorder mode', async () => {
    await renderWall()

    fireEvent.click(screen.getByRole('button', { name: 'Simular arrastre' }))
    expect(wallOrder()).toEqual(['a', 'c', 'b'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(api.patch).toHaveBeenCalledTimes(1)
    expect(api.patch).toHaveBeenCalledWith('/moments/reorder', [
      { id: 'a', order: 1 },
      { id: 'c', order: 2 },
      { id: 'b', order: 3 },
    ])
    expect(pagesMutate).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(api.patch).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByTitle('Salir del modo reordenamiento'))
    })
    expect(pagesMutate).toHaveBeenCalledTimes(1)
  })
})
