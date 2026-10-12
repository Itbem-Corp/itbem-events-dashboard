import { eventAccessSummary, isEventClientViewer } from '@/components/events/event-access-summary'
import type { EventCapabilities } from '@/models/EventMember'
import { describe, expect, it } from 'vitest'

const caps = (granted: Array<keyof EventCapabilities>): Partial<EventCapabilities> =>
  Object.fromEntries(granted.map((key) => [key, true]))

describe('eventAccessSummary', () => {
  it.each([
    [caps(['members:manage', 'event:manage']), false, 'Administras el equipo y la operación de este evento'],
    [caps(['event:manage', 'guest:manage', 'checkin:run', 'analytics:view']), true, 'Eres cliente de este evento: puedes editarlo y operarlo'],
    [caps(['event:manage']), false, 'Puedes editar este evento y su contenido'],
    [caps(['guest:manage', 'checkin:run']), false, 'Puedes gestionar invitados, RSVP y check-in'],
    [caps(['guest:manage']), false, 'Puedes gestionar invitados y RSVP'],
    [caps(['checkin:run']), false, 'Puedes operar el check-in'],
    [caps(['analytics:view']), false, 'Puedes consultar métricas y resultados'],
    [caps([]), false, 'Acceso de consulta'],
  ])('%j (client %s)', (capabilities, isEventClient, expected) => {
    expect(eventAccessSummary(capabilities, { isEventClient })).toBe(expected)
  })

  it('checkin-only no longer mentions RSVP', () => {
    expect(eventAccessSummary(caps(['checkin:run']))).not.toContain('RSVP')
  })
})

describe('isEventClientViewer', () => {
  const session = { organizations: [{ id: 'org-1' }], event_access: { assigned_events: 1, capabilities: [] } } as never
  const member = { platformLevel: 'none' as const }

  it('trusts viewer_access when present', () => {
    expect(isEventClientViewer({ viewer_access: 'event_client', client_id: 'org-1' }, session, member)).toBe(true)
    expect(isEventClientViewer({ viewer_access: 'organization', client_id: 'org-9' }, session, member)).toBe(false)
  })

  it('infers it for an event of an organization the user does not belong to', () => {
    expect(isEventClientViewer({ client_id: 'org-9' }, session, member)).toBe(true)
    expect(isEventClientViewer({ client_id: 'org-1' }, session, member)).toBe(false)
    expect(isEventClientViewer({ client_id: 'org-9' }, session, { platformLevel: 'root_1' })).toBe(false)
    expect(isEventClientViewer({ client_id: 'org-9' }, { organizations: [] } as never, member)).toBe(false)
  })
})
