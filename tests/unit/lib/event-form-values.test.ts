import { emptyEventFormValues, eventFormValuesFromEvent } from '@/lib/event-form-values'
import type { Event } from '@/models/Event'
import { describe, expect, it } from 'vitest'

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-001',
    name: 'Evento Test',
    identifier: 'evento-test',
    is_active: true,
    event_date_time: '2026-08-15T20:30:00Z',
    timezone: 'America/Mexico_City',
    event_type_id: 'type-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Event
}

describe('event form values', () => {
  it('keeps new events with the operational default capacity', () => {
    expect(emptyEventFormValues('client-1')).toMatchObject({
      client_id: 'client-1',
      max_guests: 100,
      timezone: 'America/Mexico_City',
      language: 'es',
      is_active: true,
    })
  })

  it('preserves unlimited backend capacity as null when editing', () => {
    expect(eventFormValuesFromEvent(event({ max_guests: null }), 'client-1')).toMatchObject({
      client_id: 'client-1',
      max_guests: null,
    })
  })

  it('keeps finite backend capacity when editing', () => {
    expect(eventFormValuesFromEvent(event({ max_guests: 250 })).max_guests).toBe(250)
  })
})
