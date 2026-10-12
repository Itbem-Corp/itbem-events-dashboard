import { describe, expect, it } from 'vitest'

import { planDuplicateSchedule } from '@/lib/event-duplicate-schedule'

// EVT-86: the copy kept the old RSVP deadline and access window and was born closed.
describe('planDuplicateSchedule', () => {
  const now = new Date('2026-10-12T12:00:00Z')

  it('explains why the copy would be born closed with the source dates', () => {
    const plan = planDuplicateSchedule(
      {
        rsvp_deadline: '2026-10-01T06:00:00Z',
        active_from: '0001-01-01T00:00:00Z',
        active_until: '2026-10-10T06:00:00Z',
      },
      now
    )
    expect(plan.hasScheduleDates).toBe(true)
    expect(plan.closedReasons).toHaveLength(2)
    expect(plan.closedReasons[0]).toMatch(/fecha límite/)
    expect(plan.closedReasons[1]).toMatch(/Disponible hasta/)
  })

  it('reports future dates as movable but not closed', () => {
    expect(planDuplicateSchedule({ rsvp_deadline: '2026-12-01T06:00:00Z' }, now)).toEqual({
      closedReasons: [],
      hasScheduleDates: true,
    })
  })

  it('does nothing without dates', () => {
    expect(planDuplicateSchedule({ rsvp_deadline: null, active_from: '0001-01-01T00:00:00Z' }, now)).toEqual({
      closedReasons: [],
      hasScheduleDates: false,
    })
    expect(planDuplicateSchedule(null, now).hasScheduleDates).toBe(false)
  })
})
