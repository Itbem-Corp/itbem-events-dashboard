import { isApiEnvelope, mapApiList, mapApiListItems, readApiData, readApiList, withApiData } from '@/lib/api-envelope'
import { eventDetailPath, eventsDashboardPath, eventsPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { normalizeKeys } from '@/lib/normalizer'
import type { Event } from '@/models/Event'
import { requestPathFromUnknownKey } from '@/lib/request-context'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEventCacheRecord<T extends Partial<Event>>(event: T): T {
  const normalized = normalizeKeys(event)
  return isRecord(normalized) ? (normalized as T) : event
}

export function isEventListCacheKey(key: unknown): boolean {
  const path = requestPathFromUnknownKey(key)
  return Boolean(path && (path === eventsPath() || path.startsWith(`${eventsPath()}?`)))
}

export function isEventOverviewCacheKey(key: unknown): boolean {
  const path = requestPathFromUnknownKey(key)
  return Boolean(path && (path === eventsDashboardPath() || path.startsWith(`${eventsDashboardPath()}?`)))
}

export function isEventCollectionCacheKey(key: unknown): boolean {
  return isEventListCacheKey(key) || isEventOverviewCacheKey(key)
}

export function isEventDetailCacheKey(key: unknown, eventId: string | number): boolean {
  return requestPathFromUnknownKey(key) === eventDetailPath(eventId)
}

export function isEventCacheKey(key: unknown, eventId: string | number): boolean {
  return isEventListCacheKey(key) || isEventDetailCacheKey(key, eventId)
}

interface EventListCache {
  get(key: unknown): unknown
  keys(): IterableIterator<unknown>
}

/** Finds the event snapshot already rendered by Home or Events. */
export function findEventInListCache(cache: EventListCache, eventId: string | number): Event | undefined {
  const targetId = String(eventId)

  for (const key of cache.keys()) {
    if (!isEventListCacheKey(key)) continue
    const state = cache.get(key)
    const payload = isRecord(state) && 'data' in state ? state.data : undefined
    const event = readApiList<Event>(payload).find((candidate) => cacheRecordId(candidate) === targetId)
    if (event) return normalizeEventCacheRecord(event)
  }

  return undefined
}

export function patchEventCacheValue(payload: unknown, eventId: string | number, patch: Partial<Event>): unknown {
  const targetId = String(eventId)
  const nextPatch = normalizeEventCacheRecord(patch)
  const patchEvent = (event: Event): Event =>
    cacheRecordId(event) === targetId ? { ...normalizeEventCacheRecord(event), ...nextPatch } : event

  const mappedList = mapApiList<Event>(payload, patchEvent)
  if (mappedList !== payload) return mappedList

  const data = readApiData<Event | null>(payload)
  if (isRecord(data) && cacheRecordId(data) === targetId) {
    const patched = patchEvent(data as Event)
    return isApiEnvelope(payload) ? withApiData(payload, patched) : patched
  }

  return payload
}

export function removeEventCacheValue(payload: unknown, eventId: string | number): unknown {
  const targetId = String(eventId)
  return mapApiListItems<Event>(payload, (events) => events.filter((event) => cacheRecordId(event) !== targetId), {
    adjustTotal: true,
  })
}

export function upsertEventCacheValue(payload: unknown, event: Event | null | undefined): unknown {
  const targetId = cacheRecordId(event)
  if (!targetId || !event) return payload
  const nextEvent = normalizeEventCacheRecord(event)
  let found = false
  const updated = mapApiListItems<Event>(
    payload,
    (events) => {
      const index = events.findIndex((item) => cacheRecordId(item) === targetId)
      if (index === -1) return [...events, nextEvent]
      found = true
      const next = [...events]
      next[index] = { ...normalizeEventCacheRecord(next[index]), ...nextEvent }
      return next
    },
    { adjustTotal: true }
  )
  if (updated !== payload || found) return updated
  return withApiData(payload, [nextEvent])
}
