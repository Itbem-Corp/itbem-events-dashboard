import { readApiList } from '@/lib/api-envelope'
import { momentSummaryPath } from '@/lib/api-paths'
import { normalizeKeys } from '@/lib/normalizer'
import type { MomentSummary } from '@/models/MomentSummary'

type RecordValue = Record<string, unknown>

export const MOMENT_SUMMARY_EVENT_ID_BATCH_SIZE = 100

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compactEventId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const eventId = String(value).trim()
  return eventId || null
}

function normalizeNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value !== 'string') return 0

  const numeric = Number(value.trim())
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
}

export function normalizeMomentSummary(value: unknown): MomentSummary | null {
  const normalized = normalizeKeys(value)
  if (!isRecord(normalized)) return null

  const eventId = compactEventId(normalized.event_id)
  if (!eventId) return null

  return {
    event_id: eventId,
    pending_count: normalizeNonNegativeInt(normalized.pending_count),
  }
}

export function normalizeMomentSummaryList(payload: unknown): MomentSummary[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const summary = normalizeMomentSummary(item)
      return summary ? [summary] : normalizeMomentSummaryList(item)
    })
  }

  const normalizedPayload = normalizeKeys(payload)
  const summaries = readApiList<unknown>(normalizedPayload)
    .map(normalizeMomentSummary)
    .filter((summary): summary is MomentSummary => summary !== null)
  if (summaries.length > 0) return summaries

  if (isRecord(normalizedPayload)) {
    for (const key of ['data', 'items']) {
      if (key in normalizedPayload) return normalizeMomentSummaryList(normalizedPayload[key])
    }
  }

  return summaries
}

export function momentSummaryPendingMap(payload: unknown): Record<string, number> {
  const map: Record<string, number> = {}
  for (const summary of normalizeMomentSummaryList(payload)) {
    map[summary.event_id] = summary.pending_count
  }
  return map
}

export function momentSummaryPathsForEventIds(
  eventIds: Array<string | number | null | undefined>,
  batchSize = MOMENT_SUMMARY_EVENT_ID_BATCH_SIZE
): string[] {
  const normalizedIds = Array.from(
    new Set(eventIds.map(compactEventId).filter((eventId): eventId is string => eventId !== null))
  )
  if (normalizedIds.length === 0) return []

  const safeBatchSize = Math.max(1, Math.trunc(batchSize))
  const paths: string[] = []
  for (let index = 0; index < normalizedIds.length; index += safeBatchSize) {
    paths.push(momentSummaryPath(normalizedIds.slice(index, index + safeBatchSize)))
  }
  return paths
}
