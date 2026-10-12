import { describe, expect, it } from 'vitest'

import {
  checkSeat,
  isSeatable,
  readSeatingPlanStaleError,
  readTableOverCapacityError,
  seatRefusalMessage,
  seatsNeeded,
} from '@/components/events/seating/seating-capacity'
import { confirmLeaveSeating, SEATING_UNSAVED_CHANGES_MESSAGE } from '@/components/events/seating/seating-unsaved-guard'
import type { Guest } from '@/models/Guest'

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g-1',
    event_id: 'event-1',
    first_name: 'Ana',
    last_name: 'Garcia',
    guests_count: 1,
    status_id: 'status-1',
    table_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const table = { id: 'T1', capacity: 8 }

describe('seating capacity rule (SEAT-1)', () => {
  it('counts seats by party size like the backend guests_count', () => {
    expect(seatsNeeded(guest({ guests_count: 4 }))).toBe(4)
    expect(seatsNeeded(guest({ guests_count: 4, rsvp_guest_count: 2, rsvp_status: 'confirmed' }))).toBe(2)
    expect(seatsNeeded(guest({ guests_count: 3, rsvp_status: 'declined' }))).toBe(0)
  })

  it('refuses a party of 4 at a table of 8 with 6 seats taken', () => {
    const check = checkSeat(table, new Map([['T1', 6]]), guest({ guests_count: 4 }), null)
    expect(check).toEqual({ ok: false, free: 2, needed: 4 })
    expect(seatRefusalMessage('Mesa 1', check)).toBe(
      'Mesa 1 no tiene lugar suficiente: quedan 2 lugares y este grupo necesita 4 lugares.'
    )
  })

  it('agrees the verb with a single free seat and with none (GST-63)', () => {
    expect(seatRefusalMessage('Mesa B', { ok: false, free: 1, needed: 2 })).toBe(
      'Mesa B no tiene lugar suficiente: queda 1 lugar y este grupo necesita 2 lugares.'
    )
    expect(seatRefusalMessage('Mesa B', { ok: false, free: 0, needed: 1 })).toBe(
      'Mesa B no tiene lugar suficiente: ya no quedan lugares y este grupo necesita 1 lugar.'
    )
  })

  it('allows a party that exactly fills the table', () => {
    expect(checkSeat(table, new Map([['T1', 4]]), guest({ guests_count: 4 }), null).ok).toBe(true)
  })

  it('does not count the moved guest twice when they already sit at the table', () => {
    expect(checkSeat(table, new Map([['T1', 8]]), guest({ guests_count: 4 }), 'T1')).toEqual({
      ok: true,
      free: 4,
      needed: 4,
    })
  })

  it('treats declined guests as not seatable (SEAT-6)', () => {
    expect(isSeatable(guest({ rsvp_status: 'declined' }))).toBe(false)
    expect(isSeatable(guest({ rsvp_status: 'pending' }))).toBe(true)
    expect(isSeatable(guest({ rsvp_status: 'confirmed' }))).toBe(true)
  })
})

describe('readTableOverCapacityError', () => {
  it('reads the backend 409 with table ids', () => {
    const error = {
      response: {
        status: 409,
        data: { code: 'table_over_capacity', message: 'La mesa supera su capacidad', table_ids: ['T1', 'T2'] },
      },
    }
    expect(readTableOverCapacityError(error)).toEqual({
      message: 'La mesa supera su capacidad',
      tableIds: ['T1', 'T2'],
      tables: [],
    })
  })

  it('accepts the code under error and ids nested in data', () => {
    const error = {
      response: { status: 409, data: { error: 'table_over_capacity', data: { table_ids: ['T3'] } } },
    }
    expect(readTableOverCapacityError(error)).toEqual({
      message: expect.stringContaining('superan su capacidad'),
      tableIds: ['T3'],
      tables: [],
    })
  })

  it('reads the final contract with data.tables details', () => {
    const error = {
      response: {
        status: 409,
        data: {
          status: 409,
          code: 'table_over_capacity',
          error: 'table_over_capacity',
          message: 'La mesa «Mesa 1» (10 de 8 lugares) no tiene lugar suficiente.',
          table_ids: ['T1'],
          data: { table_ids: ['T1'], tables: [{ table_id: 'T1', name: 'Mesa 1', capacity: 8, seats: 10 }] },
        },
      },
    }
    expect(readTableOverCapacityError(error)).toEqual({
      message: 'La mesa «Mesa 1» (10 de 8 lugares) no tiene lugar suficiente.',
      tableIds: ['T1'],
      tables: [{ tableId: 'T1', name: 'Mesa 1', capacity: 8, seats: 10 }],
    })
  })

  it('reads seating_plan_stale and nothing else', () => {
    expect(
      readSeatingPlanStaleError({ response: { status: 409, data: { code: 'seating_plan_stale', message: 'Recarga' } } })
    ).toEqual({ message: 'Recarga' })
    expect(readSeatingPlanStaleError({ response: { status: 409, data: { error: 'seating_plan_stale' } } })).toEqual({
      message: expect.stringContaining('Recarga el plan de mesas'),
    })
    expect(readSeatingPlanStaleError({ response: { status: 409, data: { code: 'table_over_capacity' } } })).toBeNull()
    expect(readSeatingPlanStaleError({ response: { status: 400, data: { code: 'seating_plan_stale' } } })).toBeNull()
  })

  it('ignores other conflicts and statuses', () => {
    expect(readTableOverCapacityError({ response: { status: 409, data: { error: 'other' } } })).toBeNull()
    expect(readTableOverCapacityError({ response: { status: 400, data: { code: 'table_over_capacity' } } })).toBeNull()
    expect(readTableOverCapacityError(new Error('boom'))).toBeNull()
  })
})

describe('confirmLeaveSeating (SEAT-5)', () => {
  it('asks only when there are unsaved changes', () => {
    const confirm = (message: string) => message === SEATING_UNSAVED_CHANGES_MESSAGE && false
    expect(confirmLeaveSeating(false, confirm)).toBe(true)
    expect(confirmLeaveSeating(true, confirm)).toBe(false)
    expect(confirmLeaveSeating(true, () => true)).toBe(true)
  })
})
