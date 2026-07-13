import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { eventSectionsPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { compareEventSectionsByRenderOrder, sortEventSectionsByRenderOrder } from '@/lib/event-section-order'
import type { EventSection } from '@/models/EventSection'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function firstDefinedValue(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) return undefined

  let blankString: string | undefined

  for (const key of keys) {
    const candidate = value[key]
    if (candidate === undefined || candidate === null) continue
    if (typeof candidate === 'string' && !candidate.trim()) {
      blankString ??= candidate
      continue
    }
    return candidate
  }

  return blankString
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

function normalizeConfig(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}

    try {
      return normalizeConfig(JSON.parse(trimmed)) ?? {}
    } catch {
      return {}
    }
  }

  if (isRecord(value)) return value
  return {}
}

function normalizeSection(section: EventSection): EventSection {
  const id = normalizeString(firstDefinedValue(section, ['id', 'ID', 'Id']))
  const eventId = normalizeString(firstDefinedValue(section, ['event_id', 'eventId', 'eventID', 'EventID', 'EventId']))
  const key = normalizeString(firstDefinedValue(section, ['key', 'Key']))
  const name = normalizeString(firstDefinedValue(section, ['name', 'Name', 'title', 'Title']))
  const title = normalizeString(firstDefinedValue(section, ['title', 'Title']))
  const componentType = normalizeString(
    firstDefinedValue(section, ['component_type', 'componentType', 'ComponentType', 'type', 'Type'])
  )
  const type = normalizeString(firstDefinedValue(section, ['type', 'Type']))
  const order = normalizeNumber(firstDefinedValue(section, ['order', 'Order', 'sort_order', 'sortOrder', 'SortOrder']))
  const isVisible = normalizeBoolean(firstDefinedValue(section, ['is_visible', 'isVisible', 'IsVisible']))
  const config = normalizeConfig(firstDefinedValue(section, ['config', 'Config']))
  const contentJson = normalizeConfig(
    firstDefinedValue(section, ['content_json', 'contentJson', 'ContentJSON', 'ContentJson'])
  )

  return {
    ...section,
    ...(id !== undefined ? { id } : {}),
    ...(eventId !== undefined ? { event_id: eventId } : {}),
    ...(key !== undefined ? { key } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(componentType !== undefined ? { component_type: componentType } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(isVisible !== undefined ? { is_visible: isVisible } : {}),
    ...(config !== undefined ? { config } : {}),
    ...(contentJson !== undefined ? { content_json: contentJson } : {}),
  }
}

function mapSectionListPayload(payload: unknown, mapper: (sections: EventSection[]) => EventSection[]): unknown {
  return mapApiListItems<EventSection>(payload, mapper, { adjustTotal: true })
}

function mergeSection(existing: EventSection | undefined, incoming: EventSection): EventSection {
  const next = normalizeSection(incoming)

  return {
    ...existing,
    ...next,
    config: next.config ?? existing?.config,
    content_json: next.content_json ?? existing?.content_json,
  }
}

export function isEventSectionsCacheKey(key: unknown, eventId: string | number): key is string {
  return key === eventSectionsPath(eventId)
}

export function upsertEventSectionCacheValue(payload: unknown, section: EventSection | null | undefined): unknown {
  const targetId = cacheRecordId(section)
  if (!targetId || !section) return payload
  const nextSection = normalizeSection(section)

  const updated = mapSectionListPayload(payload, (sections) => {
    const index = sections.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return sortEventSectionsByRenderOrder([...sections, nextSection])

    const next = [...sections]
    next[index] = mergeSection(next[index], nextSection)
    return sortEventSectionsByRenderOrder(next)
  })

  return updated === payload ? withApiData(payload, [nextSection]) : updated
}

export function removeEventSectionCacheValue(payload: unknown, sectionId: string | number | null | undefined): unknown {
  if (sectionId === null || sectionId === undefined) return payload
  const targetId = String(sectionId)

  return mapSectionListPayload(payload, (sections) => sections.filter((item) => cacheRecordId(item) !== targetId))
}

export function reorderEventSectionsCacheValue(
  payload: unknown,
  updates: Array<{ id: string | number; order: number }>
): unknown {
  if (updates.length === 0) return payload

  const orderById = new Map(updates.map((item) => [cacheRecordId(item), item.order]))

  return mapSectionListPayload(payload, (sections) =>
    sections
      .map((section) => {
        const order = orderById.get(cacheRecordId(section))
        return order === undefined ? section : { ...section, order }
      })
      .sort(compareEventSectionsByRenderOrder)
  )
}
