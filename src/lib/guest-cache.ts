import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { eventGuestsPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import type { GuestStatusUpdatePayload } from '@/lib/guest-utils'
import { normalizeKeys } from '@/lib/normalizer'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeGuestCacheRecord<T extends Partial<Guest>>(guest: T): T {
  const normalized = normalizeKeys(guest)
  return isRecord(normalized) ? (normalized as T) : guest
}

function mapGuestListPayload(payload: unknown, mapper: (guests: Guest[]) => Guest[]): unknown {
  return mapApiListItems<Guest>(payload, mapper, { adjustTotal: true })
}

export function isEventGuestsCacheKey(key: unknown, eventId: string | number): key is string {
  if (typeof key !== 'string') return false
  const encodedEventId = eventGuestsPath(eventId).slice('/guests/all:'.length)
  return (
    key === eventGuestsPath(eventId) ||
    key === `/guests/seating:${encodedEventId}` ||
    key.startsWith(`/guests/page:${encodedEventId}?`) ||
    key.startsWith(`/guests/checkin:${encodedEventId}?`) ||
    key.startsWith(`/guests/invitations:${encodedEventId}?`)
  )
}

export function eventGuestsCacheKeyFilter(eventId: string | number) {
  return (key: unknown): key is string => isEventGuestsCacheKey(key, eventId)
}

export function patchGuestCacheValue(payload: unknown, guestId: string | number, patch: Partial<Guest>): unknown {
  const targetId = String(guestId)
  const nextPatch = normalizeGuestCacheRecord(patch)
  return mapGuestListPayload(payload, (guests) =>
    guests.map((guest) =>
      cacheRecordId(guest) === targetId ? { ...normalizeGuestCacheRecord(guest), ...nextPatch } : guest
    )
  )
}

export function patchGuestsCacheValue(
  payload: unknown,
  guestIds: Iterable<string | number>,
  patch: Partial<Guest>
): unknown {
  const ids = new Set(Array.from(guestIds, (id) => String(id)))
  if (ids.size === 0) return payload
  const nextPatch = normalizeGuestCacheRecord(patch)

  return mapGuestListPayload(payload, (guests) =>
    guests.map((guest) =>
      ids.has(cacheRecordId(guest)) ? { ...normalizeGuestCacheRecord(guest), ...nextPatch } : guest
    )
  )
}

export function upsertGuestCacheValue(payload: unknown, guest: Guest | null | undefined): unknown {
  const targetId = cacheRecordId(guest)
  if (!targetId || !guest) return payload
  const nextGuest = normalizeGuestCacheRecord(guest)

  const updated = mapGuestListPayload(payload, (guests) => {
    const index = guests.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return [...guests, nextGuest]

    const next = [...guests]
    next[index] = { ...normalizeGuestCacheRecord(next[index]), ...nextGuest }
    return next
  })

  return updated === payload ? withApiData(payload, [nextGuest]) : updated
}

export function upsertGuestListCacheValue(payload: unknown, guests: Guest[]): unknown {
  return guests.reduce((current, guest) => upsertGuestCacheValue(current, guest), payload)
}

export function mergeGuestCacheUpdate(updatedGuest: Guest | null | undefined, fallbackGuest: Guest): Guest {
  const normalizedFallback = normalizeGuestCacheRecord(fallbackGuest)
  if (!updatedGuest) return normalizedFallback

  const normalizedGuest = normalizeGuestCacheRecord(updatedGuest)
  if (!cacheRecordId(normalizedGuest)) return normalizedFallback

  return {
    ...normalizedFallback,
    ...normalizedGuest,
    guests_count: normalizedGuest.guests_count ?? normalizedFallback.guests_count,
    max_guests: normalizedGuest.max_guests ?? normalizedFallback.max_guests,
    invitation_id: normalizedGuest.invitation_id ?? normalizedFallback.invitation_id,
    pretty_token: normalizedGuest.pretty_token ?? normalizedFallback.pretty_token,
    status_id: normalizedGuest.status_id ?? normalizedFallback.status_id,
    guest_status_id: normalizedGuest.guest_status_id ?? normalizedFallback.guest_status_id,
    status: normalizedGuest.status ?? normalizedFallback.status,
    guest_status: normalizedGuest.guest_status ?? normalizedFallback.guest_status,
    rsvp_status: normalizedGuest.rsvp_status ?? normalizedFallback.rsvp_status,
    rsvp_at: normalizedGuest.rsvp_at ?? normalizedFallback.rsvp_at,
    rsvp_method: normalizedGuest.rsvp_method ?? normalizedFallback.rsvp_method,
    rsvp_guest_count: normalizedGuest.rsvp_guest_count ?? normalizedFallback.rsvp_guest_count,
    rsvp_token_id: normalizedGuest.rsvp_token_id ?? normalizedFallback.rsvp_token_id,
    rsvp_notes: normalizedGuest.rsvp_notes ?? normalizedFallback.rsvp_notes,
    dietary_restrictions: normalizedGuest.dietary_restrictions ?? normalizedFallback.dietary_restrictions,
    notes: normalizedGuest.notes ?? normalizedFallback.notes,
  }
}

export function removeGuestsCacheValue(payload: unknown, guestIds: Iterable<string | number>): unknown {
  const ids = new Set(Array.from(guestIds, (id) => String(id)))
  if (ids.size === 0) return payload

  return mapGuestListPayload(payload, (guests) => guests.filter((guest) => !ids.has(cacheRecordId(guest))))
}

export function buildGuestStatusCachePatch(status: GuestStatus, payload: GuestStatusUpdatePayload): Partial<Guest> {
  const statusId = cacheRecordId(status) || payload.guest_status_id || payload.status_id
  return {
    ...payload,
    status_id: statusId,
    guest_status_id: statusId,
    status,
    guest_status: status,
  }
}
