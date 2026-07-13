import {
  GO_ZERO_RFC3339,
  addDaysToLocalDateTime,
  getCalendarDaysUntil,
  isGoZeroDate,
  isLocalDateTimeRangeInvalid,
  toDateTimeLocalValue,
  toRFC3339,
} from '@/lib/date-time'
import { describe, expect, it } from 'vitest'

describe('toRFC3339', () => {
  it('adds seconds and the selected timezone offset for datetime-local values', () => {
    expect(toRFC3339('2026-02-27T16:03', 'America/Mexico_City')).toBe('2026-02-27T16:03:00-06:00')
  })

  it('formats an API datetime for the selected event timezone', () => {
    expect(toDateTimeLocalValue('2026-08-15T02:30:00Z', 'America/Mexico_City')).toBe('2026-08-14T20:30')
  })

  it('keeps existing seconds while adding the timezone offset', () => {
    expect(toRFC3339('2026-02-27T16:03:45', 'America/Mexico_City')).toBe('2026-02-27T16:03:45-06:00')
  })

  it('uses the selected timezone offset for local wall time after DST starts', () => {
    expect(toRFC3339('2026-03-08T03:30', 'America/New_York')).toBe('2026-03-08T03:30:00-04:00')
  })

  it('uses the selected timezone offset for local wall time after DST ends', () => {
    expect(toRFC3339('2026-11-01T02:30', 'America/New_York')).toBe('2026-11-01T02:30:00-05:00')
  })
})

describe('toDateTimeLocalValue', () => {
  it('hides Go zero timestamps from datetime-local inputs', () => {
    expect(toDateTimeLocalValue(GO_ZERO_RFC3339)).toBe('')
    expect(isGoZeroDate(GO_ZERO_RFC3339)).toBe(true)
  })

  it('trims RFC3339 timestamps to the datetime-local shape', () => {
    expect(toDateTimeLocalValue('2026-02-27T16:03:45-06:00')).toBe('2026-02-27T16:03')
  })
})

describe('addDaysToLocalDateTime', () => {
  it('adds calendar days without shifting the local wall time', () => {
    const local = toDateTimeLocalValue('2026-08-15T02:30:00Z', 'America/Mexico_City')

    expect(local).toBe('2026-08-14T20:30')
    expect(addDaysToLocalDateTime(local, 30)).toBe('2026-09-13T20:30')
    expect(toRFC3339(addDaysToLocalDateTime(local, 30), 'America/Mexico_City')).toBe(
      '2026-09-13T20:30:00-06:00'
    )
  })

  it('keeps invalid local datetime values unchanged', () => {
    expect(addDaysToLocalDateTime('', 30)).toBe('')
    expect(addDaysToLocalDateTime('not-a-date', 30)).toBe('not-a-date')
  })
})

describe('getCalendarDaysUntil', () => {
  it('uses event timezone calendar days instead of remaining hours', () => {
    expect(
      getCalendarDaysUntil(
        '2026-08-16T05:30:00Z',
        'America/Mexico_City',
        new Date('2026-08-15T06:30:00Z')
      )
    ).toBe(0)
  })

  it('marks yesterday as past even when it was less than 24 hours ago', () => {
    expect(
      getCalendarDaysUntil(
        '2026-08-16T05:30:00Z',
        'America/Mexico_City',
        new Date('2026-08-16T06:30:00Z')
      )
    ).toBe(-1)
  })

  it('returns null for missing, invalid, or Go zero timestamps', () => {
    expect(getCalendarDaysUntil('', 'America/Mexico_City')).toBeNull()
    expect(getCalendarDaysUntil(GO_ZERO_RFC3339, 'America/Mexico_City')).toBeNull()
    expect(getCalendarDaysUntil('not-a-date', 'America/Mexico_City')).toBeNull()
  })
})

describe('isLocalDateTimeRangeInvalid', () => {
  it('requires the end datetime to be after the start datetime', () => {
    expect(isLocalDateTimeRangeInvalid('2026-07-10T18:00', '2026-07-10T17:59')).toBe(true)
    expect(isLocalDateTimeRangeInvalid('2026-07-10T18:00', '2026-07-10T18:00')).toBe(true)
    expect(isLocalDateTimeRangeInvalid('2026-07-10T18:00', '2026-07-10T18:01')).toBe(false)
  })

  it('allows open-ended ranges', () => {
    expect(isLocalDateTimeRangeInvalid('', '2026-07-10T18:00')).toBe(false)
    expect(isLocalDateTimeRangeInvalid('2026-07-10T18:00', '')).toBe(false)
  })
})
