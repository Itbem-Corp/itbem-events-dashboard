import { buildEventGuestAnalytics } from '@/lib/event-guest-analytics'
import type { Guest } from '@/models/Guest'
import { describe, expect, it } from 'vitest'

function guest(id: string, status: string, extras: Partial<Guest> = {}): Guest {
  return {
    id,
    event_id: 'event-1',
    first_name: 'Invitado',
    last_name: id,
    status: { id: `status-${status}`, code: status, name: status },
    ...extras,
  } as Guest
}

describe('buildEventGuestAnalytics', () => {
  it('derives RSVP, capacity and grouping metrics in one model', () => {
    const model = buildEventGuestAnalytics([
      guest('1', 'CONFIRMED', { role: 'vip', rsvp_guest_count: 3, dietary_restrictions: 'Vegano' }),
      guest('2', 'DECLINED', { role: 'guest' }),
      guest('3', 'PENDING', { role: 'guest' }),
    ])

    expect(model).toMatchObject({
      confirmed: 1,
      declined: 1,
      pending: 1,
      responded: 2,
      totalPlusOnes: 2,
      estimatedAttendees: 3,
      hasDietary: true,
      dietaryCounts: { Vegano: 1 },
      roleCounts: { vip: 1, guest: 2 },
    })
  })

  it('keeps only the five largest confirmed parties', () => {
    const guests = Array.from({ length: 7 }, (_, index) =>
      guest(String(index), 'CONFIRMED', { rsvp_guest_count: index + 1 })
    )

    expect(buildEventGuestAnalytics(guests).topPlusOnes.map((item) => item.id)).toEqual(['6', '5', '4', '3', '2'])
  })

  it('builds a chronological cumulative RSVP timeline', () => {
    const model = buildEventGuestAnalytics([
      guest('1', 'DECLINED', { rsvp_at: '2026-05-02T10:00:00Z' }),
      guest('2', 'CONFIRMED', { rsvp_at: '2026-05-01T10:00:00Z' }),
    ])

    expect(model.rsvpTimeline).toHaveLength(2)
    expect(model.rsvpTimeline[0]).toMatchObject({ confirmados: 1, declinados: 0 })
    expect(model.rsvpTimeline[1]).toMatchObject({ confirmados: 1, declinados: 1 })
  })
})
