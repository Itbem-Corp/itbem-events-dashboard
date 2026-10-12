import { describe, expect, it } from 'vitest'

import { countdownTargetDateInputValue, hasCountdownTargetDate } from '@/lib/countdown-target-date'

describe('countdown target date', () => {
  it('shows local values in a datetime-local input', () => {
    expect(countdownTargetDateInputValue('2026-12-01T18:00')).toBe('2026-12-01T18:00')
    expect(countdownTargetDateInputValue('2026-12-01T18:00:30')).toBe('2026-12-01T18:00')
  })

  it('does not misread values with a zone or garbage', () => {
    expect(countdownTargetDateInputValue('2026-12-01T18:00:00Z')).toBe('')
    expect(countdownTargetDateInputValue('mañana')).toBe('')
    expect(countdownTargetDateInputValue(null)).toBe('')
  })

  it('knows when the section has its own date', () => {
    expect(hasCountdownTargetDate('2026-12-01T18:00:00Z')).toBe(true)
    expect(hasCountdownTargetDate('')).toBe(false)
    expect(hasCountdownTargetDate(undefined)).toBe(false)
  })
})
