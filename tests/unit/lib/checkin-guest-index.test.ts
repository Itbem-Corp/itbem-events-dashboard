import { buildCheckinGuestIndex, filterCheckinGuests } from '@/lib/checkin-guest-index'
import type { Guest } from '@/models/Guest'
import { describe, expect, it } from 'vitest'

function guest(id: string, firstName: string, status: string, extras: Partial<Guest> = {}): Guest {
  return {
    id,
    event_id: 'event-1',
    first_name: firstName,
    last_name: 'Prueba',
    status: { id: `status-${status}`, code: status, name: status },
    ...extras,
  } as Guest
}

describe('check-in guest index', () => {
  it('counts statuses in the same pass used to build the search index', () => {
    const index = buildCheckinGuestIndex([
      guest('1', 'Ana', 'PENDING'),
      guest('2', 'Beto', 'CONFIRMED'),
      guest('3', 'Caro', 'DECLINED'),
    ])

    expect(index.confirmedCount).toBe(1)
    expect(index.pendingCount).toBe(1)
  })

  it('searches names without making accents significant', () => {
    const index = buildCheckinGuestIndex([guest('1', 'José', 'PENDING'), guest('2', 'Ana', 'PENDING')])

    expect(filterCheckinGuests(index, 'jose', 'ALL').map((item) => item.id)).toEqual(['1'])
  })

  it('indexes contact and table data once and combines it with status filters', () => {
    const index = buildCheckinGuestIndex([
      guest('1', 'Ana', 'PENDING', { email: 'ana@example.com' }),
      guest('2', 'Beto', 'CONFIRMED', { phone: '5551234' }),
    ])

    expect(filterCheckinGuests(index, '5551234', 'CONFIRMED').map((item) => item.id)).toEqual(['2'])
    expect(filterCheckinGuests(index, '5551234', 'PENDING')).toEqual([])
  })

  it('keeps expected guests first and alphabetizes each status group', () => {
    const index = buildCheckinGuestIndex([
      guest('1', 'Zoe', 'CONFIRMED'),
      guest('2', 'Mario', 'PENDING'),
      guest('3', 'Ana', 'PENDING'),
    ])

    expect(filterCheckinGuests(index, '', 'ALL').map((item) => item.id)).toEqual(['3', '2', '1'])
  })
})
