import {
  eventWorkspaceCache,
  eventWorkspacePreloaders,
  preloadEventWorkspace,
} from '@/components/events/preload-event-workspace'
import { eventDetailPath } from '@/lib/api-paths'
import type { Event } from '@/models/Event'
import type { ScopedFetcherScope } from '@/lib/request-context'
import { afterEach, describe, expect, it, vi } from 'vitest'

const event = {
  id: 'event-1',
  name: 'Evento instantáneo',
  identifier: 'evento-instantaneo',
  is_active: true,
  event_date_time: '2026-07-12T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  event_type_id: 'type-1',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
} satisfies Event

const scope: ScopedFetcherScope = (path) => [path, 'eventiapp', 'organization', 'client-1']
const detailKey = scope(eventDetailPath(event.id))

afterEach(() => {
  eventWorkspaceCache.clear()
  vi.restoreAllMocks()
})

describe('preloadEventWorkspace', () => {
  it('keeps a synchronous normalized snapshot for the first detail paint', async () => {
    await eventWorkspaceCache.prime({ ...event, identifier: '', timezone: '' }, detailKey)

    expect(eventWorkspaceCache.peek(detailKey)).toMatchObject({
      id: event.id,
      identifier: event.id,
      timezone: 'America/Mexico_City',
    })
  })

  it('does not expose a snapshot to another product context with the same event id', async () => {
    await eventWorkspaceCache.prime(event, detailKey)
    const otherProductKey = [eventDetailPath(event.id), 'itbem', 'organization', 'client-1'] as const

    expect(eventWorkspaceCache.peek(detailKey)).toMatchObject({ id: event.id })
    expect(eventWorkspaceCache.peek(otherProductKey)).toBeUndefined()
    expect(eventWorkspaceCache.hasAuthoritative(otherProductKey)).toBe(false)
  })

  it('primes the visible list snapshot and refreshes the composed detail', async () => {
    const prime = vi.spyOn(eventWorkspaceCache, 'prime').mockResolvedValue(event)
    const detail = vi.spyOn(eventWorkspacePreloaders, 'detail').mockResolvedValue(event)
    const eventTypes = vi.spyOn(eventWorkspacePreloaders, 'eventTypes').mockResolvedValue([])

    await preloadEventWorkspace(event, scope)

    expect(prime).toHaveBeenCalledWith(event, detailKey)
    expect(detail).toHaveBeenCalledWith(event.id, scope)
    expect(eventTypes).toHaveBeenCalledWith(scope)
  })

  it('does not let an already resolved event type compete with critical detail data', async () => {
    vi.spyOn(eventWorkspaceCache, 'prime').mockResolvedValue(event)
    vi.spyOn(eventWorkspacePreloaders, 'detail').mockResolvedValue(event)
    const eventTypes = vi.spyOn(eventWorkspacePreloaders, 'eventTypes').mockResolvedValue([])

    await preloadEventWorkspace({
      ...event,
      event_type: {
        id: 'type-1',
        name: 'Boda',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    }, scope)

    expect(eventTypes).not.toHaveBeenCalled()
  })

  it('does not overwrite or refetch a recent authoritative detail on repeated intent', async () => {
    const composedEvent = {
      ...event,
      guest_summary: { total: 4, confirmed: 2, pending: 2, declined: 0, total_attendees: 4 },
      guest_share_summary: { total: 4, with_email: 4, with_phone: 2, pending_with_email: 2 },
      event_sections: [],
    }
    eventWorkspaceCache.rememberAuthoritative(composedEvent, detailKey)
    const prime = vi.spyOn(eventWorkspaceCache, 'prime')
    const detail = vi.spyOn(eventWorkspacePreloaders, 'detail').mockResolvedValue(composedEvent)

    const result = await preloadEventWorkspace({ ...event, name: 'Snapshot reducido' }, scope)

    expect(prime).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ name: event.name, guest_summary: composedEvent.guest_summary })
  })
})
