import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventActiveToggle } from '@/components/events/event-active-toggle'
import { api } from '@/lib/api'
import type { Event } from '@/models/Event'
import { useSWRConfig } from 'swr'

vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('swr', () => ({
  useSWRConfig: vi.fn(),
}))

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-001',
    name: 'Evento Test',
    identifier: 'evento-test',
    is_active: false,
    event_date_time: '2026-01-01T00:00:00Z',
    timezone: 'America/Mexico_City',
    event_type_id: 'type-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Event
}

describe('EventActiveToggle', () => {
  const mutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mutate.mockResolvedValue(undefined)
    vi.mocked(useSWRConfig).mockReturnValue({ mutate } as unknown as ReturnType<typeof useSWRConfig>)
  })

  it('updates event caches with the backend response when toggled', async () => {
    const onPublicContentChanged = vi.fn()
    vi.mocked(api.put).mockResolvedValueOnce({
      data: event({
        is_active: true,
        cover_image_url: 'events/evt-001/cover.webp',
        cover_view_url: 'https://signed.example.com/cover.webp',
        view_url: 'https://signed.example.com/cover.webp',
      }),
    })

    render(<EventActiveToggle event={event()} onPublicContentChanged={onPublicContentChanged} />)

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/evt-001', { is_active: true })
    })

    const [matcher, optimisticUpdater, options] = mutate.mock.calls[0]
    expect(typeof matcher).toBe('function')
    expect((matcher as (key: unknown) => boolean)('/events')).toBe(true)
    expect((matcher as (key: unknown) => boolean)('/events/evt-001/detail')).toBe(true)
    expect((matcher as (key: unknown) => boolean)('/events/evt-001/config')).toBe(false)
    expect(options).toEqual({ revalidate: false })

    expect((optimisticUpdater as (current: unknown) => unknown)(event({ is_active: false }))).toEqual(
      expect.objectContaining({ id: 'evt-001', is_active: true })
    )

    const authoritativeUpdater = mutate.mock.calls[1][1]
    expect((authoritativeUpdater as (current: unknown) => unknown)([
      event({ is_active: false, cover_image_url: 'old.webp' }),
      event({ id: 'evt-002', is_active: false, cover_image_url: 'other.webp' }),
    ])).toEqual([
      expect.objectContaining({
        id: 'evt-001',
        is_active: true,
        cover_image_url: 'events/evt-001/cover.webp',
        cover_view_url: 'https://signed.example.com/cover.webp',
        view_url: 'https://signed.example.com/cover.webp',
      }),
      expect.objectContaining({
        id: 'evt-002',
        is_active: false,
        cover_image_url: 'other.webp',
      }),
    ])
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
  })

  it('falls back to a minimal is_active patch when the backend response is empty', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: null })

    render(<EventActiveToggle event={event({ is_active: true })} />)

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/evt-001', { is_active: false })
    })

    const updater = mutate.mock.calls[0][1]
    expect((updater as (current: unknown) => unknown)(event({ is_active: true }))).toEqual(
      expect.objectContaining({ is_active: false })
    )
  })

  it('rolls back the optimistic cache patch when the request fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('network'))

    render(<EventActiveToggle event={event({ is_active: false })} />)
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(mutate.mock.calls.length).toBe(2))
    const optimisticUpdater = mutate.mock.calls[0][1]
    const rollbackUpdater = mutate.mock.calls[1][1]
    expect((optimisticUpdater as (current: unknown) => Event)(event({ is_active: false })).is_active).toBe(true)
    expect((rollbackUpdater as (current: unknown) => Event)(event({ is_active: true })).is_active).toBe(false)
  })
})
