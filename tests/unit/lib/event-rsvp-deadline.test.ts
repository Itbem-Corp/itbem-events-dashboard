import { describe, expect, it } from 'vitest'

import { rsvpDeadlineToLocal, rsvpDeadlineToUtc, rsvpDeadlineWarning } from '@/lib/event-rsvp-deadline'

describe('event RSVP deadline', () => {
  it('converts a local value in the event time zone to UTC RFC3339', () => {
    expect(rsvpDeadlineToUtc('2026-12-01T18:00', 'America/Mexico_City')).toBe('2026-12-02T00:00:00Z')
    expect(rsvpDeadlineToUtc('2026-07-01T10:00', 'America/Chicago')).toBe('2026-07-01T15:00:00Z')
    expect(rsvpDeadlineToUtc('2026-07-01T10:00', 'Europe/Madrid')).toBe('2026-07-01T08:00:00Z')
  })

  it('clears to null for an empty value', () => {
    expect(rsvpDeadlineToUtc('', 'America/Mexico_City')).toBeNull()
    expect(rsvpDeadlineToUtc('   ', 'America/Mexico_City')).toBeNull()
  })

  it('shows the stored UTC value back in the event time zone', () => {
    expect(rsvpDeadlineToLocal('2026-12-02T00:00:00Z', 'America/Mexico_City')).toBe('2026-12-01T18:00')
    expect(rsvpDeadlineToLocal(null, 'America/Mexico_City')).toBe('')
    expect(rsvpDeadlineToLocal('0001-01-01T00:00:00Z', 'America/Mexico_City')).toBe('')
  })

  it('round-trips', () => {
    const utc = rsvpDeadlineToUtc('2026-03-08T01:30', 'America/New_York')
    expect(rsvpDeadlineToLocal(utc, 'America/New_York')).toBe('2026-03-08T01:30')
  })

  it('warns when the deadline is after the event or the public window', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    expect(rsvpDeadlineWarning('2026-12-05T00:00:00Z', { eventDateTime: '2026-12-01T00:00:00Z', now })).toMatch(
      /posterior al inicio del evento/
    )
    expect(rsvpDeadlineWarning('2026-12-05T00:00:00Z', { activeUntil: '2026-12-03T00:00:00Z', now })).toMatch(
      /cierre de la página pública/
    )
    expect(rsvpDeadlineWarning('2026-11-30T00:00:00Z', { eventDateTime: '2026-12-01T00:00:00Z', now })).toBeNull()
    expect(rsvpDeadlineWarning(null, { eventDateTime: '2026-12-01T00:00:00Z', now })).toBeNull()
    expect(rsvpDeadlineWarning('2026-12-05T00:00:00Z', { eventDateTime: '0001-01-01T00:00:00Z', now })).toBeNull()
  })

  // EVT-60: a deadline already in the past was saved without any notice.
  it('warns when the deadline is already in the past', () => {
    const now = new Date('2026-10-12T12:00:00Z')
    expect(rsvpDeadlineWarning('2026-10-01T00:00:00Z', { eventDateTime: '2026-11-15T00:00:00Z', now })).toMatch(
      /ya pasó/
    )
    expect(rsvpDeadlineWarning('2026-10-13T00:00:00Z', { eventDateTime: '2026-11-15T00:00:00Z', now })).toBeNull()
  })
})
