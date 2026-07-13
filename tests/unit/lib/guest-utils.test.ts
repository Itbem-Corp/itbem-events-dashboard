import { describe, expect, it } from 'vitest'

import {
  buildGuestStatusUpdatePayload,
  findGuestStatusByCode,
  getEffectiveStatus,
  getGuestCompanionCount,
  getGuestDietaryRestrictions,
  getGuestPartySize,
  getGuestRsvpAt,
  getGuestRsvpMethod,
  getGuestRsvpNotes,
  getGuestTableLabel,
  guestStatusCodeToRsvpStatus,
  normalizeGuestStatusCode,
} from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import type { Table } from '@/models/Table'

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    event_id: 'event-1',
    first_name: 'Ana',
    last_name: 'Lopez',
    guests_count: 1,
    status_id: 'status-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeStatus(code: string, name: string): GuestStatus {
  return {
    id: code.toLowerCase(),
    code,
    name,
    color: code.toLowerCase(),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: 'table-1',
    event_id: 'event-1',
    name: 'Principal',
    capacity: 8,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('guest-utils', () => {
  it('prefers RSVP status over catalog status', () => {
    const guest = makeGuest({
      rsvp_status: 'confirmed',
      status: makeStatus('PENDING', 'Pendiente'),
    })

    expect(getEffectiveStatus(guest)).toBe('CONFIRMED')
  })

  it('falls back to catalog status when RSVP status is blank', () => {
    const guest = makeGuest({
      rsvp_status: '  ',
      status: makeStatus('CONFIRMED', 'Confirmado'),
    })

    expect(getEffectiveStatus(guest)).toBe('CONFIRMED')
  })

  it('falls back to catalog status and then pending', () => {
    expect(getEffectiveStatus(makeGuest({ status: makeStatus('DECLINED', 'Declinado') }))).toBe('DECLINED')
    expect(getEffectiveStatus(makeGuest())).toBe('PENDING')
  })

  it('reads RSVP and catalog status aliases from partially normalized guest payloads', () => {
    expect(getEffectiveStatus({ ...makeGuest(), RSVPStatus: ' confirmed ' } as unknown as Guest)).toBe('CONFIRMED')
    expect(
      getEffectiveStatus({
        ...makeGuest(),
        rsvp_status: ' ',
        rsvpStatus: ' confirmed ',
        status: makeStatus('PENDING', 'Pendiente'),
      } as unknown as Guest)
    ).toBe('CONFIRMED')
    expect(
      getEffectiveStatus({
        ...makeGuest(),
        rsvp_status: ' ',
        status: ' ',
        GuestStatus: { Code: 'DECLINED' },
      } as unknown as Guest)
    ).toBe('DECLINED')
    expect(
      getEffectiveStatus({
        ...makeGuest(),
        rsvp_status: ' ',
        status: undefined,
        GuestStatus: { Code: 'DECLINED' },
      } as unknown as Guest)
    ).toBe('DECLINED')
    expect(
      getEffectiveStatus({
        ...makeGuest(),
        rsvp_status: ' ',
        status: undefined,
        guestStatus: { code: 'confirmed' },
      } as unknown as Guest)
    ).toBe('CONFIRMED')
  })

  it('normalizes guest status catalog codes independent of backend casing', () => {
    const rawConfirmedStatus = {
      ID: 'confirmed-raw',
      code: ' ',
      Code: 'confirmed',
      Name: 'Confirmado',
    } as unknown as GuestStatus
    const statuses = [makeStatus('pending', 'Pendiente'), rawConfirmedStatus]

    expect(normalizeGuestStatusCode('confirmed')).toBe('CONFIRMED')
    expect(normalizeGuestStatusCode('DECLINED')).toBe('DECLINED')
    expect(normalizeGuestStatusCode('unknown')).toBe('PENDING')
    expect(findGuestStatusByCode(statuses, 'CONFIRMED')).toBe(rawConfirmedStatus)
  })

  it('builds status update payloads that keep catalog status and RSVP status in sync', () => {
    expect(guestStatusCodeToRsvpStatus('CONFIRMED')).toBe('confirmed')
    expect(guestStatusCodeToRsvpStatus('DECLINED')).toBe('declined')
    expect(guestStatusCodeToRsvpStatus('PENDING')).toBe('pending')

    expect(buildGuestStatusUpdatePayload(makeStatus('confirmed', 'Confirmado'))).toEqual({
      status_id: 'confirmed',
      guest_status_id: 'confirmed',
      rsvp_status: 'confirmed',
      rsvp_method: 'host',
    })
    expect(
      buildGuestStatusUpdatePayload({
        ID: 'declined-raw',
        Code: 'DECLINED',
      } as unknown as GuestStatus)
    ).toEqual({
      status_id: 'declined-raw',
      guest_status_id: 'declined-raw',
      rsvp_status: 'declined',
      rsvp_method: 'host',
    })
  })

  it('normalizes table labels', () => {
    expect(getGuestTableLabel(makeGuest({ table: makeTable() }))).toBe('Principal')
    expect(getGuestTableLabel(makeGuest({ table_number: '7' }))).toBe('Mesa 7')
    expect(getGuestTableLabel(makeGuest({ table_number: 'Mesa VIP' }))).toBe('Mesa VIP')
  })

  it('distinguishes party size from companion count', () => {
    expect(getGuestPartySize(makeGuest({ rsvp_guest_count: 2, guests_count: 4 }))).toBe(2)
    expect(getGuestPartySize(makeGuest({ rsvp_guest_count: '2' as unknown as number, guests_count: 4 }))).toBe(2)
    expect(getGuestCompanionCount(makeGuest({ rsvp_guest_count: 2, guests_count: 4 }))).toBe(1)
    expect(getGuestPartySize(makeGuest({ rsvp_guest_count: 0, guests_count: 4 }))).toBe(4)
    expect(getGuestCompanionCount(makeGuest({ rsvp_guest_count: 0, guests_count: 4 }))).toBe(3)
    expect(getGuestPartySize(makeGuest({ rsvp_guest_count: -2, guests_count: 4 }))).toBe(4)
    expect(getGuestCompanionCount(makeGuest({ rsvp_guest_count: -2, guests_count: 4 }))).toBe(3)
    expect(getGuestPartySize(makeGuest({ rsvp_status: 'declined', rsvp_guest_count: 0, guests_count: 4 }))).toBe(0)
    expect(getGuestCompanionCount(makeGuest({ rsvp_status: 'declined', rsvp_guest_count: 0, guests_count: 4 }))).toBe(0)
    expect(getGuestPartySize(makeGuest({ rsvp_guest_count: ' ' as unknown as number, guests_count: '3' as unknown as number }))).toBe(3)
    expect(getGuestPartySize(makeGuest({ guests_count: undefined as unknown as number }))).toBe(1)
  })

  it('reads party-size aliases from partially normalized guest payloads', () => {
    expect(getGuestPartySize({ ...makeGuest(), RSVPGuestCount: '3', GuestsCount: 5 } as unknown as Guest)).toBe(3)
    expect(
      getGuestCompanionCount({
        ...makeGuest(),
        guests_count: undefined as unknown as number,
        rsvp_guest_count: ' ' as unknown as number,
        rsvpGuestCount: 2,
        guestsCount: '4',
      } as unknown as Guest)
    ).toBe(1)
    expect(getGuestPartySize({ ...makeGuest(), RSVPStatus: 'declined', GuestsCount: 4 } as unknown as Guest)).toBe(0)
  })

  it('reads RSVP detail aliases from partially normalized guest payloads', () => {
    const guest = {
      ...makeGuest(),
      rsvp_at: ' ',
      RSVPAt: '2026-02-01T18:30:00Z',
      rsvp_method: ' ',
      rsvpMethod: ' web ',
      dietary_restrictions: ' ',
      DietaryRestrictions: ' Vegano ',
      rsvp_notes: ' ',
      RSVPNotes: ' Mesa cerca ',
    } as unknown as Guest

    expect(getGuestRsvpAt(guest)).toBe('2026-02-01T18:30:00Z')
    expect(getGuestRsvpMethod(guest)).toBe('web')
    expect(getGuestDietaryRestrictions(guest)).toBe('Vegano')
    expect(getGuestRsvpNotes(guest)).toBe('Mesa cerca')
  })
})
