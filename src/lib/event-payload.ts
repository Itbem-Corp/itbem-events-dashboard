import { normalizeOptionalUuid } from '@/lib/uuid'

type EventMutationPayload = Record<string, unknown> & {
  client_id?: string | null
  event_type_id?: string | null
  max_guests?: number | null
}

export function normalizeEventMutationPayload<T extends EventMutationPayload>(payload: T): T {
  const next = { ...payload } as T

  if ('client_id' in next) {
    next.client_id = normalizeOptionalUuid(next.client_id)
  }
  if ('event_type_id' in next) {
    next.event_type_id = normalizeOptionalUuid(next.event_type_id)
  }
  if ('max_guests' in next) {
    const value = next.max_guests
    next.max_guests = typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  return next
}
