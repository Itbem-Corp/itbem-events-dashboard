import { buildGuestStatusUpdatePayload, type GuestStatusUpdatePayload } from '@/lib/guest-utils'
import { httpStatusOf } from '@/features/events/capability-error'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'

/**
 * Door check-in goes through PATCH /guests/bulk/status, which needs only
 * checkin:run. 'checkin' records the door provenance (checked_in_at) so the
 * same door can undo it; 'undo_checkin' restores the previous RSVP. The
 * endpoint returns no guest data, so callers patch their caches themselves
 * and revalidate.
 */
export type CheckinPayload = GuestStatusUpdatePayload & {
  event_id: string
  ids: string[]
  action: 'checkin'
}

export type UndoCheckinPayload = {
  event_id: string
  ids: string[]
  action: 'undo_checkin'
}

export function buildCheckinPayload(eventId: string, guestId: string, confirmed: GuestStatus): CheckinPayload {
  return { event_id: eventId, ids: [guestId], action: 'checkin', ...buildGuestStatusUpdatePayload(confirmed) }
}

export function buildUndoCheckinPayload(eventId: string, guestId: string): UndoCheckinPayload {
  return { event_id: eventId, ids: [guestId], action: 'undo_checkin' }
}

/** Only a door check-in still in place can be undone from the door. */
export function canUndoCheckin(guest: Pick<Guest, 'checked_in_at'>): boolean {
  return Boolean(guest.checked_in_at)
}

export function isUndoCheckinConflict(error: unknown): boolean {
  return httpStatusOf(error) === 409
}

export const UNDO_CHECKIN_CONFLICT_MESSAGE =
  'No se puede desmarcar: el invitado confirmó por su cuenta o lo confirmó un organizador. Solo quien gestiona invitados puede cambiarlo.'
