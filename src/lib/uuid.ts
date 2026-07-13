const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export function isNilUuid(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === NIL_UUID
}

export function normalizeOptionalUuid(value: unknown): string | null {
  if (value == null) return null

  const trimmed = String(value).trim()
  if (!trimmed || trimmed.toLowerCase() === NIL_UUID) return null

  return trimmed
}
