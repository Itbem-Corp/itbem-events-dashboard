import type { Event } from '@/models/Event'

/**
 * Applies safe in-memory defaults to an event object.
 * Runs synchronously before render — does NOT persist changes.
 * The backend repair endpoint handles persistence.
 */
export function sanitizeEvent(event: Event): Event {
  return {
    ...event,
    timezone: event.timezone || 'America/Mexico_City',
    language: event.language || 'es',
    identifier: event.identifier || event.id,
  }
}

/** Describes a data integrity issue detected in an event. */
export interface EventIssue {
  field: string
  issue: string
}

/**
 * Analyzes an event for data integrity problems.
 * Returns an array of issues — if empty, no repair is needed.
 */
export function detectEventIssues(event: Event): EventIssue[] {
  const issues: EventIssue[] = []

  if (!event.identifier) {
    issues.push({ field: 'identifier', issue: 'empty' })
  }
  if (!event.timezone) {
    issues.push({ field: 'timezone', issue: 'empty' })
  }
  if (!event.event_date_time || event.event_date_time.startsWith('0001')) {
    issues.push({ field: 'event_date_time', issue: 'zero or missing' })
  }
  if (!event.language) {
    issues.push({ field: 'language', issue: 'empty' })
  }
  if (event.event_type_id && !event.event_type) {
    issues.push({ field: 'event_type', issue: 'FK present but relation not loaded' })
  }
  if (!event.config) {
    issues.push({ field: 'config', issue: 'missing event_config' })
  }

  return issues
}
