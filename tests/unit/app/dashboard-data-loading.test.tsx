import Home from '@/app/(app)/page'
import { eventGuestsPath, eventsDashboardPath } from '@/lib/api-paths'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { requestPathFromKey, type ScopedFetcherKey } from '@/lib/request-context'
import type { Event } from '@/models/Event'
import { useStore } from '@/store/useStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const nextEvent = {
  id: 'event-next',
  name: 'Evento siguiente',
  identifier: 'evento-siguiente',
  event_date_time: '2099-08-10T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  is_active: true,
  max_guests: 120,
} as Event

const overview = {
  metrics: { total: 1, active: 1, upcoming: 1, past_active: 0, total_capacity: 120 },
  next_event: nextEvent,
  next_event_guest_summary: { total: 42, confirmed: 30, pending: 9, declined: 3, total_attendees: 50 },
  active_events: [nextEvent],
}

const useSWRMock = vi.fn((key: unknown, _fetcher?: unknown, _options?: unknown): Record<string, unknown> => {
  if (key && requestPathFromKey(key as string | ScopedFetcherKey) === eventsDashboardPath()) {
    return { data: overview, isLoading: false }
  }
  return { data: undefined, isLoading: false }
})

vi.mock('swr', () => ({
  default: (key: unknown, fetcher: unknown, options: unknown) => useSWRMock(key, fetcher, options),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}))

describe('dashboard data loading', () => {
  beforeEach(() => {
    useSWRMock.mockClear()
    useStore.setState({
      user: {
        id: 'root-1',
        email: 'root@example.com',
        first_name: 'Root',
        last_name: 'User',
        is_root: true,
      },
      currentClient: null,
      profileLoaded: true,
    })
  })

  it('loads compact guest counters inside the overview without another request', () => {
    render(<Home />)

    expect(screen.getByText('42 invitados')).toBeInTheDocument()
    expect(screen.getByText('30 confirmados')).toBeInTheDocument()
    expect(screen.getByText('9 pendientes')).toBeInTheDocument()
    expect(useSWRMock).toHaveBeenCalledTimes(1)
    expect(useSWRMock.mock.calls.some(([key]) => (
      key && requestPathFromKey(key as string | ScopedFetcherKey) === eventGuestsPath(nextEvent.id)
    ))).toBe(false)
  })

  it('shows cached dashboard data immediately while revalidating with the shared deduped policy', () => {
    render(<Home />)

    expect(useSWRMock).toHaveBeenCalledWith(
      expect.arrayContaining([eventsDashboardPath()]),
      expect.any(Function),
      responsiveListSwrOptions
    )
    expect(responsiveListSwrOptions).toMatchObject({
      dedupingInterval: 15_000,
      revalidateIfStale: true,
      revalidateOnFocus: false,
    })
  })

  it('keeps cached events visible when their background refresh fails', () => {
    useSWRMock.mockImplementation((key: unknown) => {
      if (key && requestPathFromKey(key as string | ScopedFetcherKey) === eventsDashboardPath()) {
        return { data: overview, isLoading: false, error: new Error('offline'), mutate: vi.fn() }
      }
      return { data: undefined, isLoading: false }
    })

    render(<Home />)

    expect(screen.getAllByText('Evento siguiente')).not.toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados mientras recuperamos eventos')
    expect(screen.queryByText('No pudimos cargar el centro de operaciones')).not.toBeInTheDocument()
  })
})
