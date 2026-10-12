/**
 * Stable codes the backend puts in the `error` field of a failed event
 * create, update or duplicate, mapped to the form field they belong to.
 */
export type EventWriteErrorField = 'name' | 'identifier' | 'timezone'

const EVENT_WRITE_ERRORS: Record<string, { field: EventWriteErrorField; message: string }> = {
  event_name_taken: { field: 'name', message: 'Ya existe un evento con ese nombre en esta organización.' },
  event_name_too_long: { field: 'name', message: 'El nombre del evento admite máximo 120 caracteres.' },
  event_identifier_taken: { field: 'identifier', message: 'Esa URL del evento ya está en uso. Elige otra.' },
  invalid_timezone: { field: 'timezone', message: 'Zona horaria inválida' },
}

function payloadOf(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null
  const record = error as Record<string, unknown>
  const response = record.response as { data?: unknown } | undefined
  const candidate = response?.data ?? record.payload
  return candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : null
}

export function eventWriteFieldError(error: unknown): { field: EventWriteErrorField; message: string } | null {
  const payload = payloadOf(error)
  const code = typeof payload?.error === 'string' ? payload.error : null
  const known = code ? EVENT_WRITE_ERRORS[code] : undefined
  if (!known) return null
  const message = typeof payload?.message === 'string' && payload.message.trim() ? payload.message : known.message
  return { field: known.field, message }
}
