// @vitest-environment node

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
  it('starts new events in Spanish without an event-level capacity (SET-9, SET-10)', () => {
    const values = emptyEventFormValues('client-1')
    expect(values).toMatchObject({
      client_id: 'client-1',
      timezone: 'America/Mexico_City',
      language: 'es',
      is_active: true,
    })
    expect(values).not.toHaveProperty('max_guests')
  })

  it('does not carry the stored capacity into the edit payload, so it is left untouched', () => {
    expect(eventFormValuesFromEvent(event({ max_guests: 250 }), 'client-1')).not.toHaveProperty('max_guests')
  })

  it('keeps reading a legacy language harmlessly when editing', () => {
    expect(eventFormValuesFromEvent(event({ language: 'en' })).language).toBe('en')
  })

  it('maps a null event type to "no type"', () => {
    expect(eventFormValuesFromEvent(event({ event_type_id: null })).event_type_id).toBe('')
  })

  it('accepts an event without a type (event_type_id null)', () => {
    expect(eventFormValuesFromEvent(event({ event_type_id: null, event_type: null }), 'client-1')).toMatchObject({
      event_type_id: '',
    })
  })
})
