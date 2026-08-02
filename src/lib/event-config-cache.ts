import { readApiData, withApiData } from '@/lib/api-envelope'
import { eventConfigPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { isEventCacheKey, patchEventCacheValue } from '@/lib/event-cache'
import { normalizeKeys } from '@/lib/normalizer'
import type { Event } from '@/models/Event'
import type { EventConfig } from '@/models/EventConfig'
import { requestPathFromUnknownKey } from '@/lib/request-context'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function eventConfigRecordId(value: unknown): string {
  if (!isRecord(value)) return ''
  return (
    cacheRecordId(value) ||
    firstString(value.event_id) ||
    firstString(value.EventID) ||
    firstString(value.EventId)
  )
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function hasEventConfigCacheIdentity(config: EventConfig | null | undefined): boolean {
  return Boolean(eventConfigRecordId(config))
}

export function isEventConfigCacheKey(key: unknown, eventId: string | number): boolean {
  return requestPathFromUnknownKey(key) === eventConfigPath(eventId)
}

export function isEventConfigBackedEventCacheKey(key: unknown, eventId: string | number): boolean {
  return isEventCacheKey(key, eventId)
}

export function replaceEventConfigCacheValue(
  payload: unknown,
  config: EventConfig | null | undefined
): unknown {
  const normalizedConfig = normalizeKeys(config) as EventConfig | null | undefined
  if (!eventConfigRecordId(normalizedConfig)) return payload

  const data = normalizeKeys(readApiData(payload))
  const merged = isRecord(data) ? { ...data, ...normalizedConfig } : normalizedConfig

  return withApiData(payload, merged)
}

export function patchEventConfigIntoEventCacheValue(
  payload: unknown,
  eventId: string | number,
  config: EventConfig | null | undefined
): unknown {
  const normalizedConfig = normalizeKeys(config) as EventConfig | null | undefined
  if (!eventConfigRecordId(normalizedConfig)) return payload

  return patchEventCacheValue(payload, eventId, {
    config: normalizedConfig,
    event_config: normalizedConfig,
  } as Partial<Event>)
}
