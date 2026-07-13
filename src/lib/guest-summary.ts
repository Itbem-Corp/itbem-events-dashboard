import { readApiData } from '@/lib/api-envelope'
import { normalizeKeys } from '@/lib/normalizer'
import type { GuestSummary } from '@/models/GuestSummary'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value !== 'string') return 0

  const numeric = Number(value.trim())
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
}

export function normalizeGuestSummary(payload: unknown): GuestSummary | null {
  const normalized = readApiData<unknown>(normalizeKeys(payload))
  if (!isRecord(normalized)) return null

  return {
    total: normalizeNonNegativeInt(normalized.total),
    confirmed: normalizeNonNegativeInt(normalized.confirmed),
    pending: normalizeNonNegativeInt(normalized.pending),
    declined: normalizeNonNegativeInt(normalized.declined),
    total_attendees: normalizeNonNegativeInt(normalized.total_attendees),
  }
}
