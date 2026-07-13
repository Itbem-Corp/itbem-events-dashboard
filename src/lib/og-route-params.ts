import { resolveBackendMediaUrl } from '@/lib/media-url'
import { eventTypeLabel } from '@/lib/event-type-label'

export interface OgRouteParams {
  title: string
  date: string
  timezone: string
  language: string
  address: string
  cover: string
  type: string
}

function firstParam(searchParams: URLSearchParams, names: string[]): string {
  for (const name of names) {
    const value = searchParams.get(name)?.trim()
    if (value) return value
  }
  return ''
}

export function readOgRouteParams(
  searchParams: URLSearchParams,
  backendUrl: string | null | undefined
): OgRouteParams {
  const cover = firstParam(searchParams, [
    'cover',
    'coverUrl',
    'coverURL',
    'coverViewUrl',
    'coverViewURL',
    'CoverViewUrl',
    'CoverViewURL',
    'cover_view_url',
    'viewUrl',
    'viewURL',
    'ViewUrl',
    'ViewURL',
    'view_url',
    'coverImageUrl',
    'coverImageURL',
    'CoverImageUrl',
    'CoverImageURL',
    'cover_image_url',
  ])

  return {
    title: firstParam(searchParams, ['title', 'name', 'eventName', 'event_name']) || 'Evento',
    date: firstParam(searchParams, ['date', 'eventDateTime', 'event_date_time', 'eventDate', 'event_date']),
    timezone: firstParam(searchParams, ['timezone', 'timeZone', 'eventTimezone', 'event_timezone', 'tz']),
    language: firstParam(searchParams, ['language', 'lang', 'locale', 'eventLanguage', 'event_language']),
    address: firstParam(searchParams, [
      'address',
      'venue',
      'locationName',
      'location_name',
      'secondAddress',
      'second_address',
      'secondaryAddress',
      'secondary_address',
      'receptionAddress',
      'reception_address',
    ]),
    cover: resolveBackendMediaUrl(cover, backendUrl),
    type: firstParam(searchParams, ['type', 'eventType', 'event_type']),
  }
}

function validTimeZone(timezone: string | null | undefined): string | undefined {
  const trimmed = timezone?.trim()
  if (!trimmed) return undefined

  try {
    new Intl.DateTimeFormat('es', { timeZone: trimmed }).format(new Date('2026-01-01T00:00:00Z'))
    return trimmed
  } catch {
    return undefined
  }
}

function localeForLanguage(language: string | null | undefined): string {
  const trimmed = language?.trim().replace(/_/g, '-')
  if (!trimmed) return 'es-MX'

  const lower = trimmed.toLowerCase()
  if (lower === 'en' || lower.startsWith('en-')) return lower === 'en' ? 'en-US' : trimmed
  if (lower === 'es' || lower.startsWith('es-')) return lower === 'es' ? 'es-MX' : trimmed

  try {
    new Intl.DateTimeFormat(trimmed).format(new Date('2026-01-01T00:00:00Z'))
    return trimmed
  } catch {
    return 'es-MX'
  }
}

export function ogLabelsForLanguage(language: string | null | undefined): { date: string; place: string } {
  const locale = localeForLanguage(language).toLowerCase()
  if (locale.startsWith('en')) {
    return { date: 'Date', place: 'Place' }
  }
  return { date: 'Fecha', place: 'Lugar' }
}

export function formatOgEventType(type: string | null | undefined): string {
  const trimmed = type?.trim()
  return trimmed ? eventTypeLabel(trimmed) : ''
}

export function formatOgDate(date: string, timezone?: string | null, language?: string | null): string {
  const trimmed = date.trim()
  if (!trimmed) return ''

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return date

  try {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
    const timeZone = validTimeZone(timezone)
    if (timeZone) options.timeZone = timeZone

    return new Intl.DateTimeFormat(localeForLanguage(language), options).format(parsed)
  } catch {
    return date
  }
}

export function truncateOgAddress(address: string): string {
  return address.length > 40 ? `${address.slice(0, 40)}...` : address
}
