export function cacheRecordId(value: unknown): string {
  if (value === null || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  for (const key of ['id', 'ID', 'Id']) {
    const id = record[key]
    if (typeof id === 'string') {
      const trimmed = id.trim()
      if (trimmed) return trimmed
    }
    if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  }
  return ''
}
