const NIL_UUID = '00000000-0000-0000-0000-000000000000'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A well-formed UUID (any version). Route ids that fail this never reach the API. */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

export function isNilUuid(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === NIL_UUID
}

export function normalizeOptionalUuid(value: unknown): string | null {
  if (value == null) return null

  const trimmed = String(value).trim()
  if (!trimmed || trimmed.toLowerCase() === NIL_UUID) return null

  return trimmed
}
