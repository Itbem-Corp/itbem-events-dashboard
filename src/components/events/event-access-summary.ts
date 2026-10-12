import type { AccessProfile } from '@/lib/access-profile'
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { Event } from '@/models/Event'
import type { EventCapabilities } from '@/models/EventMember'

/** 'Tu alcance' line of the event detail, from the event's own capabilities. */
export function eventAccessSummary(
  capabilities: Partial<EventCapabilities> | undefined,
  { isEventClient = false }: { isEventClient?: boolean } = {}
): string {
  if (capabilities?.['members:manage']) return 'Administras el equipo y la operación de este evento'
  if (isEventClient) return 'Eres cliente de este evento: puedes editarlo y operarlo'
  if (capabilities?.['event:manage']) return 'Puedes editar este evento y su contenido'
  if (capabilities?.['guest:manage'] && capabilities?.['checkin:run'])
    return 'Puedes gestionar invitados, RSVP y check-in'
  if (capabilities?.['guest:manage']) return 'Puedes gestionar invitados y RSVP'
  if (capabilities?.['checkin:run']) return 'Puedes operar el check-in'
  if (capabilities?.['analytics:view']) return 'Puedes consultar métricas y resultados'
  return 'Acceso de consulta'
}

/**
 * The caller sees this event as an event client: the row says so, or a
 * non-root with event grants opens an event of an organization they do not
 * belong to.
 */
export function isEventClientViewer(
  event: Pick<Event, 'viewer_access' | 'client_id'> | undefined,
  session: Pick<ApplicationSession, 'organizations' | 'event_access'> | null | undefined,
  profile: Pick<AccessProfile, 'platformLevel'>
): boolean {
  if (!event) return false
  if (event.viewer_access === 'event_client') return true
  if (event.viewer_access === 'organization') return false
  return (
    profile.platformLevel === 'none' &&
    Boolean(session?.event_access) &&
    !(session?.organizations ?? []).some((organization) => organization.id === event.client_id)
  )
}
