import {
  eventWorkspaceCache,
  eventWorkspacePreloaders,
  preloadEventWorkspace,
} from '@/components/events/preload-event-workspace'
import type { Event } from '@/models/Event'
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

afterEach(() => {
  eventWorkspaceCache.clear()
  vi.restoreAllMocks()
})

describe('preloadEventWorkspace', () => {
  it('keeps a synchronous normalized snapshot for the first detail paint', async () => {
    await eventWorkspaceCache.prime({ ...event, identifier: '', timezone: '' })

    expect(eventWorkspaceCache.peek(event.id)).toMatchObject({
      id: event.id,
      identifier: event.id,
      timezone: 'America/Mexico_City',
    })
  })

  it('primes the visible list snapshot and refreshes the composed detail', async () => {
    const prime = vi.spyOn(eventWorkspaceCache, 'prime').mockResolvedValue(event)
    const detail = vi.spyOn(eventWorkspacePreloaders, 'detail').mockResolvedValue(event)
    const eventTypes = vi.spyOn(eventWorkspacePreloaders, 'eventTypes').mockResolvedValue([])

    await preloadEventWorkspace(event)

    expect(prime).toHaveBeenCalledWith(event)
    expect(detail).toHaveBeenCalledWith(event.id)
    expect(eventTypes).toHaveBeenCalledOnce()
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
    })

    expect(eventTypes).not.toHaveBeenCalled()
  })

  it('does not overwrite or refetch a recent authoritative detail on repeated intent', async () => {
    const composedEvent = {
      ...event,
      guest_summary: { total: 4, confirmed: 2, pending: 2, declined: 0, total_attendees: 4 },
      guest_share_summary: { total: 4, with_email: 4, with_phone: 2, pending_with_email: 2 },
      event_sections: [],
    }
    eventWorkspaceCache.rememberAuthoritative(composedEvent)
    const prime = vi.spyOn(eventWorkspaceCache, 'prime')
    const detail = vi.spyOn(eventWorkspacePreloaders, 'detail').mockResolvedValue(composedEvent)

    const result = await preloadEventWorkspace({ ...event, name: 'Snapshot reducido' })

    expect(prime).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ name: event.name, guest_summary: composedEvent.guest_summary })
  })
})
