import { toDateTimeLocalValue } from '@/lib/date-time'
import { normalizeOptionalUuid } from '@/lib/uuid'
import type { Event } from '@/models/Event'

export interface EventFormValues {
  name: string
  identifier?: string
  description?: string
  client_id?: string
  event_type_id?: string
  event_date_time: string
  timezone: string
  language?: string
  address?: string
  second_address?: string
  music_url?: string
  organizer_name?: string
  organizer_email?: string
  organizer_phone?: string
  max_guests: number | null
  is_active: boolean
}

export const DEFAULT_EVENT_TIMEZONE = 'America/Mexico_City'
export const DEFAULT_EVENT_LANGUAGE = 'es'
export const DEFAULT_EVENT_MAX_GUESTS = 100

export function emptyEventFormValues(currentClientId = ''): EventFormValues {
  return {
    name: '',
    identifier: '',
    description: '',
    client_id: currentClientId,
    event_type_id: '',
    event_date_time: '',
    timezone: DEFAULT_EVENT_TIMEZONE,
    language: DEFAULT_EVENT_LANGUAGE,
    address: '',
    second_address: '',
    music_url: '',
    organizer_name: '',
    organizer_email: '',
    organizer_phone: '',
    max_guests: DEFAULT_EVENT_MAX_GUESTS,
    is_active: true,
  }
}

export function eventFormValuesFromEvent(event: Event, currentClientId = ''): EventFormValues {
  const timezone = event.timezone ?? DEFAULT_EVENT_TIMEZONE

  return {
    name: event.name,
    identifier: event.identifier ?? '',
    description: event.description ?? '',
    client_id: event.client_id ?? currentClientId,
    event_type_id: normalizeOptionalUuid(event.event_type_id) ?? '',
    event_date_time: toDateTimeLocalValue(event.event_date_time, timezone),
    timezone,
    language: event.language ?? DEFAULT_EVENT_LANGUAGE,
    address: event.address ?? '',
    second_address: event.second_address ?? '',
    music_url: event.music_url ?? '',
    organizer_name: event.organizer_name ?? '',
    organizer_email: event.organizer_email ?? '',
    organizer_phone: event.organizer_phone ?? '',
    max_guests: event.max_guests ?? null,
    is_active: event.is_active,
  }
}
