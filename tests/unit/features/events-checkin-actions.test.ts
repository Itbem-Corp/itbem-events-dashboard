import {
  buildCheckinPayload,
  buildUndoCheckinPayload,
  canUndoCheckin,
  isUndoCheckinConflict,
} from '@/features/events/checkin/checkin-actions'
import type { GuestStatus } from '@/models/GuestStatus'
import { describe, expect, it } from 'vitest'

const confirmed = { id: 'status-confirmed', code: 'CONFIRMED', name: 'Confirmado' } as GuestStatus

describe('door check-in payloads (PATCH /guests/bulk/status)', () => {
  it('checks a guest in with action checkin and the confirmed status', () => {
    expect(buildCheckinPayload('evt-1', 'g-1', confirmed)).toEqual({
      event_id: 'evt-1',
      ids: ['g-1'],
      action: 'checkin',
      status_id: 'status-confirmed',
      guest_status_id: 'status-confirmed',
      rsvp_status: 'confirmed',
      rsvp_method: 'host',
    })
  })

  it('undoes with action undo_checkin and no status fields', () => {
    expect(buildUndoCheckinPayload('evt-1', 'g-1')).toEqual({
      event_id: 'evt-1',
      ids: ['g-1'],
      action: 'undo_checkin',
    })
  })

  it('offers undo only while a door check-in is in place', () => {
    expect(canUndoCheckin({ checked_in_at: '2026-10-11T20:00:00Z' })).toBe(true)
    expect(canUndoCheckin({ checked_in_at: null })).toBe(false)
    expect(canUndoCheckin({})).toBe(false)
  })

  it('recognises the 409 for a guest confirmed another way', () => {
    expect(isUndoCheckinConflict({ response: { status: 409 } })).toBe(true)
    expect(isUndoCheckinConflict({ response: { status: 403 } })).toBe(false)
  })
})
