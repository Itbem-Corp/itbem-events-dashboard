type ApiRecord = Record<string, unknown>
const API_LIST_KEYS = ['data', 'Data', 'items', 'Items']

function isRecord(value: unknown): value is ApiRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isHttpStatus(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
}

function firstPresentKey(value: ApiRecord, keys: string[]): string | null {
  for (const key of keys) {
    if (key in value) return key
  }
  return null
}

function firstDefinedKey(value: ApiRecord, keys: string[], listKeys = API_LIST_KEYS): string | null {
  let bestKey: string | null = null
  let bestScore = 0

  for (const key of keys) {
    const candidate = value[key]
    if (candidate === undefined || candidate === null) continue
    const score = envelopeDataScore(candidate, listKeys)
    if (score > bestScore) {
      bestKey = key
      bestScore = score
      if (score >= 4) break
    }
  }

  return bestKey
}

function firstArrayKey(value: ApiRecord, keys: string[]): string | null {
  let emptyArrayKey: string | null = null

  for (const key of keys) {
    if (!Array.isArray(value[key])) continue
    if ((value[key] as unknown[]).length > 0) return key
    emptyArrayKey ??= key
  }
  return emptyArrayKey
}

interface ListLocation {
  outerKey?: string
  listKey: string
  items: unknown[]
}

export interface ApiListPage<T = unknown> {
  data: unknown
  source: unknown
  items: T[]
}

export interface ApiListOptions {
  listKeys?: string[]
}

function listKeysFor(options?: ApiListOptions): string[] {
  if (!options?.listKeys?.length) return API_LIST_KEYS
  return Array.from(new Set([...options.listKeys, ...API_LIST_KEYS]))
}

function firstListLocation(value: ApiRecord, keys: string[]): ListLocation | null {
  let emptyLocation: ListLocation | null = null

  for (const key of keys) {
    const candidate = value[key]
    if (Array.isArray(candidate)) {
      const location = { listKey: key, items: candidate }
      if (candidate.length > 0) return location
      emptyLocation ??= location
      continue
    }

    if (!isRecord(candidate)) continue
    const nestedKey = firstArrayKey(candidate, keys)
    if (!nestedKey) continue

    const nestedItems = candidate[nestedKey] as unknown[]
    const location = { outerKey: key, listKey: nestedKey, items: nestedItems }
    if (nestedItems.length > 0) return location
    emptyLocation ??= location
  }

  return emptyLocation
}

function envelopeDataScore(candidate: unknown, listKeys = API_LIST_KEYS): number {
  if (candidate === undefined || candidate === null) return 0
  if (typeof candidate === 'string') return candidate.trim() ? 3 : 1
  if (Array.isArray(candidate)) return candidate.length > 0 ? 4 : 1

  if (isRecord(candidate)) {
    if (Object.keys(candidate).length === 0) return 1

    const location = firstListLocation(candidate, listKeys)
    if (location) return location.items.length > 0 ? 4 : 1

    return 3
  }

  return 3
}

function adjustListTotal<T extends ApiRecord>(container: T, previousLength: number, nextLength: number): T {
  const totalKey = typeof container.total === 'number' ? 'total' : typeof container.Total === 'number' ? 'Total' : null
  if (!totalKey) return container

  const total = container[totalKey]
  if (typeof total !== 'number' || !Number.isFinite(total)) return container

  return {
    ...container,
    [totalKey]: Math.max(0, total + nextLength - previousLength),
  }
}

function writeListLocation(
  data: ApiRecord,
  location: ListLocation,
  items: unknown[],
  adjustTotal: boolean
): ApiRecord {
  if (location.outerKey) {
    const nested = data[location.outerKey]
    if (!isRecord(nested)) return data

    const nextNested = {
      ...nested,
      [location.listKey]: items,
    }

    return {
      ...data,
      [location.outerKey]: adjustTotal
        ? adjustListTotal(nextNested, location.items.length, items.length)
        : nextNested,
    }
  }

  const nextData = {
    ...data,
    [location.listKey]: items,
  }
  return adjustTotal ? adjustListTotal(nextData, location.items.length, items.length) : nextData
}

function envelopeDataKey(value: ApiRecord, listKeys = API_LIST_KEYS): string {
  const definedKey = firstDefinedKey(value, ['data', 'Data'], listKeys)
  if (definedKey) return definedKey

  const presentKey = firstPresentKey(value, ['data', 'Data'])
  if (presentKey) return presentKey
  if ('Status' in value && !('status' in value)) return 'Data'
  return 'data'
}

export function withApiData(payload: unknown, data: unknown): unknown {
  if (!isApiEnvelope(payload)) return data
  const record = payload as ApiRecord
  return { ...record, [envelopeDataKey(record)]: data }
}

export function isApiEnvelope(value: unknown): value is ApiRecord & {
  data?: unknown
} {
  if (!isRecord(value)) return false

  const statusKey = firstPresentKey(value, ['status', 'Status'])
  const rawStatus = statusKey ? value[statusKey] : undefined
  const hasStatus = isHttpStatus(rawStatus)
  if (typeof rawStatus === 'number' && !hasStatus) return false

  const hasMessage = typeof value.message === 'string' || typeof value.Message === 'string'
  const hasError = typeof value.error === 'string' || typeof value.Error === 'string'
  const hasData = 'data' in value || 'Data' in value

  if (hasStatus && (hasMessage || hasError || hasData)) return true

  return false
}

export function readApiData<T = unknown>(payload: unknown): T {
  if (!isApiEnvelope(payload)) return payload as T
  const record = payload as ApiRecord
  return record[envelopeDataKey(record)] as T
}

export function readApiList<T = unknown>(payload: unknown, options?: ApiListOptions): T[] {
  return readApiListPage<T>(payload, options).items
}

export function readApiListPage<T = unknown>(payload: unknown, options?: ApiListOptions): ApiListPage<T> {
  const listKeys = listKeysFor(options)
  const data = isApiEnvelope(payload) ? (payload as ApiRecord)[envelopeDataKey(payload as ApiRecord, listKeys)] : payload

  if (Array.isArray(data)) {
    return { data, source: data, items: data as T[] }
  }

  if (isRecord(data)) {
    const location = firstListLocation(data, listKeys)
    if (location) {
      const source = location.outerKey && isRecord(data[location.outerKey]) ? data[location.outerKey] : data
      return { data, source, items: location.items as T[] }
    }

    return { data, source: data, items: [] }
  }

  return { data, source: data, items: [] }
}

export function mapApiListItems<T = unknown>(
  payload: unknown,
  mapper: (items: T[]) => T[],
  { adjustTotal = false }: { adjustTotal?: boolean } = {}
): unknown {
  const data = readApiData(payload)

  if (Array.isArray(data)) {
    return withApiData(payload, mapper(data as T[]))
  }

  if (isRecord(data)) {
    const location = firstListLocation(data, API_LIST_KEYS)
    if (!location) return payload

    const mappedItems = mapper(location.items as T[])
    return withApiData(payload, writeListLocation(data, location, mappedItems, adjustTotal))
  }

  return payload
}

export function mapApiList<T = unknown>(payload: unknown, mapper: (item: T) => T): unknown {
  return mapApiListItems<T>(payload, (items) => items.map((item) => mapper(item)))
}
