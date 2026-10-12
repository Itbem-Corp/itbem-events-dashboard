import { isGoZeroDate } from '@/lib/date-time'
import type { EventConfig } from '@/models/EventConfig'

export interface DuplicateSchedulePlan {
  /** Why the copy would be born closed if it kept the source dates (Spanish, for the hint). */
  closedReasons: string[]
  /** The source has an RSVP deadline or an access window that `shift_dates` would move. */
  hasScheduleDates: boolean
}

function parseDate(value?: string | null): number | null {
  if (!value || isGoZeroDate(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * `POST /events/:id/duplicate` with `shift_dates: true` (the default) moves the
 * RSVP deadline and the access window by the event-date offset and clears any
 * deadline or window end still in the past. With `false` the source dates are
 * copied unchanged; this works out which of them would leave the copy closed.
 */
export function planDuplicateSchedule(
  config: Pick<EventConfig, 'rsvp_deadline' | 'active_from' | 'active_until'> | null | undefined,
  now = new Date()
): DuplicateSchedulePlan {
  const plan: DuplicateSchedulePlan = { closedReasons: [], hasScheduleDates: false }
  if (!config) return plan

  const deadline = parseDate(config.rsvp_deadline)
  const from = parseDate(config.active_from)
  const until = parseDate(config.active_until)
  const nowMs = now.getTime()

  if (deadline !== null && deadline <= nowMs) {
    plan.closedReasons.push('la fecha límite para confirmar asistencia ya pasó')
  }
  if (until !== null && until <= nowMs) {
    plan.closedReasons.push('la página pública ya cerró («Disponible hasta»)')
  }
  plan.hasScheduleDates = deadline !== null || from !== null || until !== null
  return plan
}
