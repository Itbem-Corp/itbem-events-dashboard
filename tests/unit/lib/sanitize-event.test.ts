import { describe, expect, it } from 'vitest'

import { detectEventIssues, sanitizeEvent } from '@/lib/sanitize-event'
import type { Event } from '@/models/Event'

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    name: 'Boda Demo',
    identifier: 'boda-demo',
    is_active: true,
    event_date_time: '2026-08-15T20:30:00-06:00',
    timezone: 'America/Mexico_City',
    language: 'es',
    event_type_id: 'type-1',
    event_type: { id: 'type-1', name: 'wedding', created_at: '', updated_at: '' },
    ...overrides,
  }
}

describe('sanitizeEvent', () => {
  it('mirrors event_config into config for dashboard consumers', () => {
    const event = sanitizeEvent(
      makeEvent({
        event_config: {
          id: 'event-1',
          event_id: 'event-1',
          is_public: true,
        } as Event['event_config'],
      })
    )

    expect(event.config?.id).toBe('event-1')
    expect(event.event_config?.id).toBe('event-1')
  })

  it('does not report missing config when either alias is present', () => {
    expect(
      detectEventIssues(
        makeEvent({
          event_config: {
            id: 'event-1',
            event_id: 'event-1',
          } as Event['event_config'],
        })
      )
    ).not.toContainEqual({ field: 'config', issue: 'missing event_config' })
  })

  it('treats backend nil UUID event_type_id as unassigned', () => {
    expect(
      detectEventIssues(
        makeEvent({
          event_type_id: '00000000-0000-0000-0000-000000000000',
          event_type: null,
        })
      )
    ).not.toContainEqual({ field: 'event_type', issue: 'FK present but relation not loaded' })
  })

  it('does not repair relations omitted by the lightweight dashboard detail endpoint', () => {
    expect(
      detectEventIssues(
        makeEvent({
          event_type: null,
          event_config: null,
          config: null,
        }),
        { checkRelations: false }
      )
    ).toEqual([])
  })
})
