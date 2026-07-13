import {
  buildGuestStatusCachePatch,
  isEventGuestsCacheKey,
  mergeGuestCacheUpdate,
  patchGuestCacheValue,
  patchGuestsCacheValue,
  removeGuestsCacheValue,
  upsertGuestCacheValue,
  upsertGuestListCacheValue,
} from '@/lib/guest-cache'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import { describe, expect, it } from 'vitest'

function guest(id: string, patch: Partial<Guest> = {}): Guest {
  return {
    id,
    event_id: 'evt-1',
    first_name: `Guest ${id}`,
    last_name: 'Test',
    guests_count: 1,
    status_id: 'pending',
    ...patch,
  } as Guest
}

describe('isEventGuestsCacheKey', () => {
  it('matches full and paginated keys for only the requested event', () => {
    expect(isEventGuestsCacheKey('/guests/all:evt-1', 'evt-1')).toBe(true)
    expect(isEventGuestsCacheKey('/guests/page:evt-1?page=2&page_size=50', 'evt-1')).toBe(true)
    expect(isEventGuestsCacheKey('/guests/checkin:evt-1?page=1&page_size=60', 'evt-1')).toBe(true)
    expect(isEventGuestsCacheKey('/guests/invitations:evt-1?page=1&page_size=25', 'evt-1')).toBe(true)
    expect(isEventGuestsCacheKey('/guests/all:evt-2', 'evt-1')).toBe(false)
    expect(isEventGuestsCacheKey('/guests/guest-1', 'evt-1')).toBe(false)
  })
})

describe('guest cache mutations', () => {
  it('patches direct guest arrays', () => {
    expect(patchGuestCacheValue([guest('g-1'), guest('g-2')], 'g-1', { first_name: 'Ana' })).toEqual([
      guest('g-1', { first_name: 'Ana' }),
      guest('g-2'),
    ])
  })

  it('patches multiple guests in backend envelopes', () => {
    expect(
      patchGuestsCacheValue(
        {
          status: 200,
          message: 'Guests loaded',
          data: { data: [guest('g-1'), guest('g-2')], total: 2 },
        },
        ['g-1', 'g-2'],
        { status_id: 'confirmed' }
      )
    ).toEqual({
      status: 200,
      message: 'Guests loaded',
      data: {
        data: [guest('g-1', { status_id: 'confirmed' }), guest('g-2', { status_id: 'confirmed' })],
        total: 2,
      },
    })
  })

  it('preserves Pascal-cased backend guest list envelopes', () => {
    expect(
      patchGuestsCacheValue(
        {
          Status: 200,
          Message: 'Guests loaded',
          Data: { Items: [guest('g-1'), guest('g-2')], Total: 2 },
        },
        ['g-1'],
        { rsvp_status: 'confirmed', rsvp_guest_count: 2 }
      )
    ).toEqual({
      Status: 200,
      Message: 'Guests loaded',
      Data: {
        Items: [guest('g-1', { rsvp_status: 'confirmed', rsvp_guest_count: 2 }), guest('g-2')],
        Total: 2,
      },
    })
  })

  it('upserts direct and paginated guest lists', () => {
    expect(upsertGuestCacheValue([guest('g-1')], guest('g-1', { first_name: 'Updated' }))).toEqual([
      guest('g-1', { first_name: 'Updated' }),
    ])

    expect(upsertGuestCacheValue({ items: [guest('g-1')], total: 1, page: 1 }, guest('g-2'))).toEqual({
      items: [guest('g-1'), guest('g-2')],
      total: 2,
      page: 1,
    })
  })

  it('updates non-empty guest list aliases before empty canonical list aliases', () => {
    expect(
      patchGuestCacheValue(
        {
          status: 200,
          message: 'Guests loaded',
          data: {
            data: [],
            Items: [guest('g-1'), guest('g-2')],
            Total: 2,
          },
        },
        'g-2',
        { first_name: 'Updated' }
      )
    ).toMatchObject({
      data: {
        data: [],
        Items: [
          expect.objectContaining({ id: 'g-1', first_name: 'Guest g-1' }),
          expect.objectContaining({ id: 'g-2', first_name: 'Updated' }),
        ],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data guest pages before empty canonical containers', () => {
    const payload = {
      data: { items: [] },
      Data: {
        Items: [guest('g-1'), guest('g-2')],
        Total: 2,
      },
    }

    expect(patchGuestCacheValue(payload, 'g-2', { first_name: 'Updated' })).toMatchObject({
      data: { items: [] },
      Data: {
        Items: [
          expect.objectContaining({ id: 'g-1', first_name: 'Guest g-1' }),
          expect.objectContaining({ id: 'g-2', first_name: 'Updated' }),
        ],
        Total: 2,
      },
    })

    expect(upsertGuestCacheValue(payload, guest('g-3'))).toEqual({
      data: { items: [] },
      Data: {
        Items: [guest('g-1'), guest('g-2'), guest('g-3')],
        Total: 3,
      },
    })

    expect(removeGuestsCacheValue(payload, ['g-1'])).toEqual({
      data: { items: [] },
      Data: {
        Items: [guest('g-2')],
        Total: 1,
      },
    })
  })

  it('normalizes backend aliases when upserting guest records', () => {
    const savedGuest = {
      ID: 'g-1',
      EventID: 'evt-1',
      FirstName: 'Ana',
      LastName: 'Garcia',
      PrettyToken: 'TOKEN123',
      RSVPGuestCount: 2,
      GuestStatusID: 'confirmed-id',
      GuestStatus: { Code: 'CONFIRMED' },
      ImageURL: 'profiles/ana.webp',
      Image1URL: 'profiles/ana-1.webp',
    } as unknown as Guest

    expect(upsertGuestCacheValue(undefined, savedGuest)).toEqual([
      {
        id: 'g-1',
        event_id: 'evt-1',
        first_name: 'Ana',
        last_name: 'Garcia',
        pretty_token: 'TOKEN123',
        rsvp_guest_count: 2,
        guest_status_id: 'confirmed-id',
        status_id: 'confirmed-id',
        guest_status: { code: 'CONFIRMED' },
        status: { code: 'CONFIRMED' },
        image_url: 'profiles/ana.webp',
        image1_url: 'profiles/ana-1.webp',
        image_1_url: 'profiles/ana-1.webp',
      },
    ])
  })

  it('normalizes patched guest aliases before merging cache records', () => {
    expect(
      patchGuestCacheValue([{ ID: 'g-1', FirstName: 'Old', LastName: 'Name' } as unknown as Guest], 'g-1', {
        RSVPGuestCount: 0,
        StatusID: 'declined-id',
      } as unknown as Partial<Guest>)
    ).toEqual([
      {
        id: 'g-1',
        first_name: 'Old',
        last_name: 'Name',
        rsvp_guest_count: 0,
        status_id: 'declined-id',
      },
    ])
  })

  it('seeds empty or envelope-only caches when upserting guests', () => {
    expect(upsertGuestCacheValue(undefined, guest('g-1'))).toEqual([guest('g-1')])
    expect(upsertGuestCacheValue({ status: 200, message: 'No data loaded' }, guest('g-1'))).toEqual({
      status: 200,
      message: 'No data loaded',
      data: [guest('g-1')],
    })
    expect(upsertGuestCacheValue({ Status: 200, Message: 'No data loaded' }, guest('g-1'))).toEqual({
      Status: 200,
      Message: 'No data loaded',
      Data: [guest('g-1')],
    })
  })

  it('upserts a list of created guests', () => {
    expect(upsertGuestListCacheValue(undefined, [guest('g-1'), guest('g-2')])).toEqual([guest('g-1'), guest('g-2')])
    expect(upsertGuestListCacheValue([guest('g-1')], [guest('g-2'), guest('g-3')])).toEqual([
      guest('g-1'),
      guest('g-2'),
      guest('g-3'),
    ])
  })

  it('keeps optimistic status aliases when update responses omit hydrated status objects', () => {
    const status = { id: 'confirmed-id', code: 'CONFIRMED', name: 'Confirmed' } as GuestStatus
    const fallbackGuest = guest('g-1', {
      status_id: status.id,
      guest_status_id: status.id,
      status,
      guest_status: status,
      rsvp_status: 'confirmed',
      rsvp_method: 'host',
    })
    const updatedGuest = guest('g-1', {
      first_name: 'Updated by API',
      status_id: status.id,
      guest_status_id: status.id,
      rsvp_status: 'confirmed',
      updated_at: '2026-02-01T00:00:00Z',
    })

    expect(mergeGuestCacheUpdate(updatedGuest, fallbackGuest)).toEqual({
      ...fallbackGuest,
      ...updatedGuest,
      status,
      guest_status: status,
      rsvp_method: 'host',
    })
  })

  it('keeps RSVP details when update responses omit dashboard tracking fields', () => {
    const fallbackGuest = guest('g-1', {
      invitation_id: 'inv-1',
      pretty_token: 'TOKEN123',
      guests_count: 3,
      max_guests: 4,
      rsvp_status: 'confirmed',
      rsvp_at: '2026-02-01T00:00:00Z',
      rsvp_method: 'web',
      rsvp_guest_count: 3,
      rsvp_token_id: 'token-id',
      rsvp_notes: 'Mesa cerca de la pista',
      dietary_restrictions: 'Vegano',
      notes: 'Nota interna',
    })
    const updatedGuest = {
      id: 'g-1',
      event_id: 'evt-1',
      first_name: 'Updated by API',
      last_name: 'Test',
      guests_count: undefined,
      status_id: 'confirmed',
      rsvp_at: undefined,
      rsvp_guest_count: undefined,
      rsvp_notes: undefined,
      dietary_restrictions: undefined,
      notes: undefined,
    } as unknown as Guest

    expect(mergeGuestCacheUpdate(updatedGuest, fallbackGuest)).toMatchObject({
      first_name: 'Updated by API',
      guests_count: 3,
      max_guests: 4,
      invitation_id: 'inv-1',
      pretty_token: 'TOKEN123',
      rsvp_status: 'confirmed',
      rsvp_at: '2026-02-01T00:00:00Z',
      rsvp_method: 'web',
      rsvp_guest_count: 3,
      rsvp_token_id: 'token-id',
      rsvp_notes: 'Mesa cerca de la pista',
      dietary_restrictions: 'Vegano',
      notes: 'Nota interna',
    })
  })

  it('keeps explicit RSVP clears from update responses', () => {
    const fallbackGuest = guest('g-1', {
      guests_count: 3,
      rsvp_status: 'confirmed',
      rsvp_guest_count: 3,
      rsvp_notes: 'Mesa cerca de la pista',
      dietary_restrictions: 'Vegano',
      notes: 'Nota interna',
    })
    const updatedGuest = guest('g-1', {
      guests_count: 0,
      rsvp_status: 'declined',
      rsvp_guest_count: 0,
      rsvp_notes: '',
      dietary_restrictions: '',
      notes: '',
    })

    expect(mergeGuestCacheUpdate(updatedGuest, fallbackGuest)).toMatchObject({
      guests_count: 0,
      rsvp_status: 'declined',
      rsvp_guest_count: 0,
      rsvp_notes: '',
      dietary_restrictions: '',
      notes: '',
    })
  })

  it('falls back to the optimistic guest when update responses cannot be identified', () => {
    const fallbackGuest = guest('g-1', { rsvp_status: 'confirmed' })

    expect(mergeGuestCacheUpdate(null, fallbackGuest)).toEqual(fallbackGuest)
  })

  it('normalizes aliased update responses before merging optimistic status fields', () => {
    const status = { id: 'confirmed-id', code: 'CONFIRMED', name: 'Confirmed' } as GuestStatus
    const fallbackGuest = guest('g-1', { status, guest_status: status })

    expect(
      mergeGuestCacheUpdate({ ID: 'g-1', FirstName: 'Pascal API' } as unknown as Guest, fallbackGuest)
    ).toMatchObject({
      id: 'g-1',
      first_name: 'Pascal API',
      status,
      guest_status: status,
    })
  })

  it('removes guests without dropping envelope metadata', () => {
    expect(
      removeGuestsCacheValue(
        {
          status: 200,
          message: 'Guests loaded',
          data: { data: [guest('g-1'), guest('g-2')], total: 2, page: 1 },
        },
        ['g-1']
      )
    ).toEqual({
      status: 200,
      message: 'Guests loaded',
      data: { data: [guest('g-2')], total: 1, page: 1 },
    })

    expect(
      removeGuestsCacheValue(
        {
          Status: 200,
          Message: 'Guests loaded',
          Data: { Items: [guest('g-1'), guest('g-2')], Total: 2, Page: 1 },
        },
        ['g-1']
      )
    ).toEqual({
      Status: 200,
      Message: 'Guests loaded',
      Data: { Items: [guest('g-2')], Total: 1, Page: 1 },
    })
  })
})

describe('buildGuestStatusCachePatch', () => {
  it('hydrates both status aliases used by the dashboard', () => {
    const status = { id: 'confirmed-id', code: 'CONFIRMED', name: 'Confirmed' } as GuestStatus

    expect(
      buildGuestStatusCachePatch(status, {
        status_id: status.id,
        guest_status_id: status.id,
        rsvp_status: 'confirmed',
        rsvp_method: 'host',
      })
    ).toEqual({
      status_id: status.id,
      guest_status_id: status.id,
      rsvp_status: 'confirmed',
      rsvp_method: 'host',
      status,
      guest_status: status,
    })
  })

  it('keeps status ids when the catalog item uses backend casing aliases', () => {
    const status = { ID: 'declined-id', Code: 'DECLINED', Name: 'Declinado' } as unknown as GuestStatus

    expect(
      buildGuestStatusCachePatch(status, {
        status_id: 'declined-id',
        guest_status_id: 'declined-id',
        rsvp_status: 'declined',
        rsvp_method: 'host',
      })
    ).toMatchObject({
      status_id: 'declined-id',
      guest_status_id: 'declined-id',
      status,
      guest_status: status,
    })
  })
})
