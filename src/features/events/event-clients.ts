import { getApiErrorMessage } from '@/lib/api-error'
import { httpStatusOf } from '@/features/events/capability-error'

/**
 * Event clients (EVENT_CLIENT_ACCESS). An event client is a person outside
 * the organization who sees only the events assigned to them, with the same
 * event-level powers as an event manager. Shapes follow the backend contract
 * for /api/events/:id/clients* and /api/clients/:id/members/event-clients.
 * With the flag off every route answers 404 event_client_access_disabled and
 * the UI renders nothing new.
 */

export interface EventClient {
  user_id: string
  email: string
  first_name: string
  last_name: string
  granted_at: string
  granted_by_user_id: string
}

export interface EventClientCandidate {
  user_id: string
  email: string
  first_name: string
  last_name: string
  assigned_events: number
  assigned_to_event: boolean
}

export interface EventClientAssignment {
  event_id: string
  name: string
  event_date_time: string
  timezone: string
  is_active: boolean
  assigned: boolean
  can_manage: boolean
}

export interface EventClientAssignmentPage {
  data: EventClientAssignment[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface EventClientAssignmentUpdate {
  assign: string[]
  unassign: string[]
}

export interface EventClientAssignmentResult {
  assigned: string[]
  unassigned: string[]
  assigned_events: number
}

export type EventClientCreateRequest =
  | { email: string; first_name: string; last_name: string }
  | { user_id: string }

export interface EventClientCreateResponse {
  client: EventClient
  account: 'created' | 'existing'
  already_assigned: boolean
}

export interface EventClientPerson {
  user_id: string
  email: string
  first_name: string
  last_name: string
}

export interface OrganizationEventClientGrant {
  grant_id: string
  event_id: string
  event_name: string
  event_date_time: string
  client: EventClientPerson
  granted_by: EventClientPerson
  granted_at: string
}

export interface OrganizationEventClientPage {
  data: OrganizationEventClientGrant[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export type EventClientErrorCode =
  | 'event_client_access_disabled'
  | 'invalid_request'
  | 'invalid_email'
  | 'event_client_not_found'
  | 'event_client_is_org_member'
  | 'event_client_self'
  | 'event_client_unavailable'
  | 'event_outside_organization'
  | 'event_client_invite_failed'
  | 'event_client_grant_failed'

const EVENT_CLIENT_ERROR_MESSAGES: Record<EventClientErrorCode, string> = {
  event_client_access_disabled: 'Esta función no está disponible.',
  invalid_request: 'Revisa los datos e inténtalo de nuevo.',
  invalid_email: 'Escribe un correo válido.',
  event_client_not_found: 'Ese cliente ya no tiene acceso a este evento.',
  event_client_is_org_member:
    'Esta persona pertenece o perteneció a la organización del evento. Gestiona su acceso desde Equipo.',
  event_client_self: 'No puedes asignarte a ti mismo como cliente.',
  event_client_unavailable:
    'No podemos asignar esta cuenta como cliente. Verifica el correo o contacta a soporte.',
  event_outside_organization: 'Uno o más eventos no pertenecen a esta organización.',
  event_client_invite_failed: 'No se pudo crear la cuenta del cliente.',
  event_client_grant_failed: 'No se pudo asignar el evento al cliente.',
}

export const EVENT_CLIENT_RATE_LIMIT_MESSAGE = 'Demasiados intentos. Espera un momento.'

type ResponseErrorPayload = { error?: unknown; data?: unknown }

function errorPayload(error: unknown): ResponseErrorPayload | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as { response?: { data?: unknown }; payload?: unknown }
  const payload = candidate.response?.data ?? candidate.payload
  return payload && typeof payload === 'object' ? (payload as ResponseErrorPayload) : undefined
}

export function eventClientErrorCode(error: unknown): EventClientErrorCode | undefined {
  const code = errorPayload(error)?.error
  return typeof code === 'string' && code in EVENT_CLIENT_ERROR_MESSAGES ? (code as EventClientErrorCode) : undefined
}

/** The feature is off on the backend (flag) or the product has no events. */
export function isEventClientAccessDisabled(error: unknown): boolean {
  return httpStatusOf(error) === 404 && eventClientErrorCode(error) === 'event_client_access_disabled'
}

/** Spanish message for an event-client error; falls back to the API message. */
export function eventClientErrorMessage(error: unknown, fallback = 'No se pudo completar la acción.'): string {
  if (httpStatusOf(error) === 429) return EVENT_CLIENT_RATE_LIMIT_MESSAGE
  const code = eventClientErrorCode(error)
  if (code) return EVENT_CLIENT_ERROR_MESSAGES[code]
  return getApiErrorMessage(error, fallback)
}

/** Event ids a 422 event_outside_organization answer lists. */
export function eventClientRejectedEventIds(error: unknown): string[] {
  if (eventClientErrorCode(error) !== 'event_outside_organization') return []
  const data = errorPayload(error)?.data as { event_ids?: unknown } | undefined
  return Array.isArray(data?.event_ids) ? data.event_ids.filter((id): id is string => typeof id === 'string') : []
}

export function eventClientDisplayName(person: Pick<EventClientPerson, 'first_name' | 'last_name' | 'email'>): string {
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
  return name || person.email
}

/** Only the changes: ids to assign and to unassign, never the unchanged ones. */
export function eventClientAssignmentDelta(
  original: ReadonlyMap<string, boolean>,
  selected: ReadonlyMap<string, boolean>
): EventClientAssignmentUpdate {
  const assign: string[] = []
  const unassign: string[] = []
  for (const [eventId, isSelected] of selected) {
    const wasAssigned = original.get(eventId) ?? false
    if (isSelected && !wasAssigned) assign.push(eventId)
    if (!isSelected && wasAssigned) unassign.push(eventId)
  }
  return { assign, unassign }
}

export function formatGrantedDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
