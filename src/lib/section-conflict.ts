import { apiErrorCode, apiErrorStatus } from '@/lib/api-error'
import { cacheRecordId } from '@/lib/cache-record'
import type { EventSection } from '@/models/EventSection'

/**
 * STU-N3 optimistic concurrency for PUT /sections/:id (backend contract, wave 3):
 * the body carries `expected_updated_at` (the section's `updated_at` exactly as the API
 * returned it); a mismatch answers 409 `section_conflict` with the current section in
 * `data`; a malformed value answers 400 `invalid_expected_updated_at`.
 */
export const SECTION_CONFLICT_CODE = 'section_conflict'
export const INVALID_EXPECTED_UPDATED_AT_CODE = 'invalid_expected_updated_at'

/** Thrown by the Studio save when another tab or person saved the section first. */
export class SectionConflictError extends Error {
  readonly current: EventSection | null

  constructor(current: EventSection | null) {
    super('Esta sección cambió en otra pestaña.')
    this.name = 'SectionConflictError'
    this.current = current
  }
}

export function isSectionConflictError(error: unknown): error is SectionConflictError {
  return error instanceof SectionConflictError
}

function payloadData(error: unknown): unknown {
  const payload = (error as { response?: { data?: unknown } } | null)?.response?.data
  if (!payload || typeof payload !== 'object') return null
  return (payload as Record<string, unknown>).data ?? null
}

/** The current section sent with a 409 `section_conflict`, or undefined when the error is something else. */
export function sectionConflictCurrent(error: unknown): EventSection | null | undefined {
  if (apiErrorStatus(error) !== 409 || apiErrorCode(error) !== SECTION_CONFLICT_CODE) return undefined
  const data = payloadData(error)
  return cacheRecordId(data) ? (data as EventSection) : null
}

export function isInvalidExpectedUpdatedAt(error: unknown): boolean {
  if (apiErrorStatus(error) !== 400) return false
  if (apiErrorCode(error) === INVALID_EXPECTED_UPDATED_AT_CODE) return true
  const payload = (error as { response?: { data?: unknown } } | null)?.response?.data
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    (payload as Record<string, unknown>).error === INVALID_EXPECTED_UPDATED_AT_CODE
  )
}
