import { isGoZeroDate, toDateTimeLocalValue, toRFC3339 } from '@/lib/date-time'

/**
 * Converts the `datetime-local` value typed in the event's time zone into the
 * UTC RFC3339 string stored as `rsvp_deadline`. An empty value clears it (null).
 */
export function rsvpDeadlineToUtc(localDateTime: string, timeZone: string): string | null {
  const trimmed = localDateTime.trim()
  if (!trimmed) return null
  const withOffset = toRFC3339(trimmed, timeZone)
  const time = Date.parse(withOffset)
  if (Number.isNaN(time)) return null
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Shows a stored `rsvp_deadline` back as a `datetime-local` value in the event's time zone. */
export function rsvpDeadlineToLocal(value: string | null | undefined, timeZone: string): string {
  if (!value || isGoZeroDate(value)) return ''
  return toDateTimeLocalValue(value, timeZone)
}

/**
 * Non-blocking warning when the deadline is already past, falls after the event
 * starts or after the public access window closes.
 */
export function rsvpDeadlineWarning(
  deadlineUtc: string | null,
  limits: { eventDateTime?: string | null; activeUntil?: string | null; now?: Date }
): string | null {
  if (!deadlineUtc) return null
  const deadline = Date.parse(deadlineUtc)
  if (Number.isNaN(deadline)) return null

  if (deadline < (limits.now ?? new Date()).getTime()) {
    return 'Esta fecha ya pasó: los invitados ya no pueden confirmar asistencia.'
  }

  const until = limits.activeUntil && !isGoZeroDate(limits.activeUntil) ? Date.parse(limits.activeUntil) : NaN
  if (!Number.isNaN(until) && deadline > until) {
    return 'La fecha límite es posterior al cierre de la página pública: después de ese cierre nadie podrá confirmar.'
  }
  const eventTime = limits.eventDateTime && !isGoZeroDate(limits.eventDateTime) ? Date.parse(limits.eventDateTime) : NaN
  if (!Number.isNaN(eventTime) && deadline > eventTime) {
    return 'La fecha límite es posterior al inicio del evento.'
  }
  return null
}
