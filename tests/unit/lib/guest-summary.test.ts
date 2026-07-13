import { normalizeGuestSummary } from '@/lib/guest-summary'
import { describe, expect, it } from 'vitest'

describe('guest summary model', () => {
  it('normalizes the standard API envelope and backend casing variants', () => {
    expect(
      normalizeGuestSummary({
        Status: 200,
        Message: 'ok',
        Data: {
          Total: '12',
          Confirmed: 7,
          Pending: 3,
          Declined: 2,
          TotalAttendees: '15',
        },
      })
    ).toEqual({
      total: 12,
      confirmed: 7,
      pending: 3,
      declined: 2,
      total_attendees: 15,
    })
  })

  it('clamps malformed counters and rejects non-object payloads', () => {
    expect(
      normalizeGuestSummary({ total: -4, confirmed: 'bad', pending: 1.9, declined: null, total_attendees: -1 })
    ).toEqual({ total: 0, confirmed: 0, pending: 1, declined: 0, total_attendees: 0 })
    expect(normalizeGuestSummary(null)).toBeNull()
    expect(normalizeGuestSummary([])).toBeNull()
  })
})
