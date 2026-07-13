import { describe, expect, it } from 'vitest'

import {
  EVENT_COLLECTION_REFRESH_INTERVAL_MS,
  EVENT_LIVE_REFRESH_INTERVAL_MS,
  eventGuestRefreshInterval,
  eventLiveRefreshInterval,
  shouldLiveRefreshEvent,
  shouldLoadEventGuests,
  shouldRefreshEventGuests,
} from '@/lib/event-live-refresh'

describe('event live refresh helpers', () => {
  it('enables guest refresh only for public-response driven tabs', () => {
    expect(shouldRefreshEventGuests('invitaciones')).toBe(true)
    expect(shouldRefreshEventGuests('invitados')).toBe(true)
    expect(shouldRefreshEventGuests('rsvp')).toBe(true)
    expect(shouldRefreshEventGuests('analiticas')).toBe(true)

    expect(shouldRefreshEventGuests('resumen')).toBe(false)
    expect(shouldRefreshEventGuests(undefined)).toBe(false)
  })

  it('loads the full collection only for panels that consume guest records', () => {
    expect(shouldLoadEventGuests('invitaciones')).toBe(false)
    expect(shouldLoadEventGuests('rsvp')).toBe(false)
    expect(shouldLoadEventGuests('invitados')).toBe(false)
    expect(shouldLoadEventGuests('asientos')).toBe(false)
    expect(shouldLoadEventGuests('resumen')).toBe(false)
    expect(shouldLoadEventGuests('momentos')).toBe(false)
    expect(shouldLoadEventGuests('analiticas')).toBe(false)
    expect(shouldLoadEventGuests('configuracion')).toBe(false)
    expect(shouldLoadEventGuests(undefined)).toBe(false)
  })

  it('returns the shared interval only when live refresh is enabled', () => {
    expect(eventLiveRefreshInterval(true)).toBe(EVENT_LIVE_REFRESH_INTERVAL_MS)
    expect(eventLiveRefreshInterval(false)).toBe(0)
  })

  it('polls heavy analytics collections less often than operational guest views', () => {
    expect(eventGuestRefreshInterval(true, 'analiticas')).toBe(EVENT_COLLECTION_REFRESH_INTERVAL_MS)
    expect(eventGuestRefreshInterval(true, 'invitados')).toBe(EVENT_LIVE_REFRESH_INTERVAL_MS)
    expect(eventGuestRefreshInterval(false, 'analiticas')).toBe(0)
  })

  it('keeps live polling only for active events that have not passed', () => {
    const now = new Date('2026-07-10T12:00:00Z')

    expect(shouldLiveRefreshEvent(true, '2026-07-11T12:00:00Z', 'UTC', now)).toBe(true)
    expect(shouldLiveRefreshEvent(true, '2026-07-10T01:00:00Z', 'UTC', now)).toBe(true)
    expect(shouldLiveRefreshEvent(true, '2026-07-09T23:59:00Z', 'UTC', now)).toBe(false)
    expect(shouldLiveRefreshEvent(false, '2026-07-11T12:00:00Z', 'UTC', now)).toBe(false)
    expect(shouldLiveRefreshEvent(true, null, 'UTC', now)).toBe(false)
  })
})
