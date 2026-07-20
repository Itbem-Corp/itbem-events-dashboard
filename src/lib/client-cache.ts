import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { clientsPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { normalizeKeys } from '@/lib/normalizer'
import type { Client } from '@/models/Client'
import { requestPathFromUnknownKey } from '@/lib/request-context'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeClientCacheRecord<T extends Partial<Client>>(client: T): T {
  const normalized = normalizeKeys(client)
  return isRecord(normalized) ? (normalized as T) : client
}

function mergeClient(existing: Client | undefined, incoming: Client): Client {
  const normalizedExisting = existing ? normalizeClientCacheRecord(existing) : undefined
  const normalizedIncoming = normalizeClientCacheRecord(incoming)

  return {
    ...normalizedExisting,
    ...normalizedIncoming,
    client_type: normalizedIncoming.client_type ?? normalizedExisting?.client_type,
    parent: normalizedIncoming.parent ?? normalizedExisting?.parent,
    children: normalizedIncoming.children ?? normalizedExisting?.children,
  }
}

function mapClientListPayload(payload: unknown, mapper: (clients: Client[]) => Client[]): unknown {
  return mapApiListItems<Client>(payload, mapper, { adjustTotal: true })
}

export function isClientsCacheKey(key: unknown): boolean {
  const path = requestPathFromUnknownKey(key)
  return Boolean(path && (path === clientsPath() || path.startsWith(`${clientsPath()}?`)))
}

export function upsertClientCacheValue(payload: unknown, client: Client | null | undefined): unknown {
  const targetId = cacheRecordId(client)
  if (!targetId || !client) return payload
  const nextClient = normalizeClientCacheRecord(client)

  const updated = mapClientListPayload(payload, (clients) => {
    const index = clients.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return [...clients, nextClient]

    const next = [...clients]
    next[index] = mergeClient(next[index], nextClient)
    return next
  })

  return updated === payload ? withApiData(payload, [nextClient]) : updated
}

export function removeClientsCacheValue(payload: unknown, clientIds: Iterable<string | number>): unknown {
  const ids = new Set(Array.from(clientIds, (id) => String(id)))
  if (ids.size === 0) return payload

  return mapClientListPayload(payload, (clients) => clients.filter((client) => !ids.has(cacheRecordId(client))))
}
