import { normalizeEventMutationPayload } from '@/lib/event-payload'
import { describe, expect, it } from 'vitest'

describe('event-payload', () => {
  it('normalizes empty optional dashboard selects to null', () => {
    expect(
      normalizeEventMutationPayload({
        name: 'Demo',
        client_id: '00000000-0000-0000-0000-000000000000',
        event_type_id: '   ',
        max_guests: Number.NaN,
      })
    ).toEqual({
      name: 'Demo',
      client_id: null,
      event_type_id: null,
      max_guests: null,
    })
  })

  it('trims optional UUID-like fields and keeps finite guest limits', () => {
    expect(
      normalizeEventMutationPayload({
        client_id: ' client-1 ',
        event_type_id: ' event-type-1 ',
        max_guests: 120,
      })
    ).toEqual({
      client_id: 'client-1',
      event_type_id: 'event-type-1',
      max_guests: 120,
    })
  })
})
