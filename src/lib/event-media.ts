import { resolveBackendMediaUrl } from '@/lib/media-url'
import { getMediaRefreshDelay, getPresignedUrlExpiry } from '@/lib/signed-media'
import type { Event } from '@/models/Event'

export type EventCoverSource = Pick<
  Event,
  'cover_image_url' | 'cover_view_url' | 'view_url' | 'cover_view_url_expires_at' | 'view_url_expires_at'
> & {
  id?: string | number | null
  ID?: string | number | null
  Id?: string | number | null
  coverImageUrl?: string | null
  coverImageURL?: string | null
  CoverImageURL?: string | null
  CoverImageUrl?: string | null
  coverViewUrl?: string | null
  coverViewURL?: string | null
  CoverViewURL?: string | null
  CoverViewUrl?: string | null
  viewUrl?: string | null
  viewURL?: string | null
  ViewURL?: string | null
  ViewUrl?: string | null
  coverImageUrlExpiresAt?: string | null
  coverImageURLExpiresAt?: string | null
  CoverImageURLExpiresAt?: string | null
  CoverImageUrlExpiresAt?: string | null
  coverViewUrlExpiresAt?: string | null
  coverViewURLExpiresAt?: string | null
  CoverViewURLExpiresAt?: string | null
  CoverViewUrlExpiresAt?: string | null
  viewUrlExpiresAt?: string | null
  viewURLExpiresAt?: string | null
  ViewURLExpiresAt?: string | null
  ViewUrlExpiresAt?: string | null
}

export const EVENT_COVER_REFRESH_SKEW_MS = 60 * 1000

function firstString(source: EventCoverSource | null | undefined, keys: Array<keyof EventCoverSource>): string {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function eventCoverId(event: EventCoverSource | null | undefined): string {
  if (!event) return ''
  for (const key of ['id', 'ID', 'Id'] as const) {
    const value = event[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function eventCoverDisplayKind(event: EventCoverSource | null | undefined): 'coverView' | 'view' | 'coverImage' | '' {
  if (firstString(event, ['cover_view_url', 'coverViewUrl', 'coverViewURL', 'CoverViewURL', 'CoverViewUrl']))
    return 'coverView'
  if (firstString(event, ['view_url', 'viewUrl', 'viewURL', 'ViewURL', 'ViewUrl'])) return 'view'
  if (firstString(event, ['cover_image_url', 'coverImageUrl', 'coverImageURL', 'CoverImageURL', 'CoverImageUrl']))
    return 'coverImage'
  return ''
}

export function eventCoverDisplaySource(event: EventCoverSource | null | undefined): string {
  return (
    firstString(event, ['cover_view_url', 'coverViewUrl', 'coverViewURL', 'CoverViewURL', 'CoverViewUrl']) ||
    firstString(event, ['view_url', 'viewUrl', 'viewURL', 'ViewURL', 'ViewUrl']) ||
    firstString(event, ['cover_image_url', 'coverImageUrl', 'coverImageURL', 'CoverImageURL', 'CoverImageUrl'])
  )
}

export function eventCoverRawSource(event: EventCoverSource | null | undefined): string {
  return firstString(event, ['cover_image_url', 'coverImageUrl', 'coverImageURL', 'CoverImageURL', 'CoverImageUrl'])
}

export function eventCoverDisplayExpiresAt(event: EventCoverSource | null | undefined): string {
  if (!eventCoverDisplaySource(event)) return ''
  const kind = eventCoverDisplayKind(event)
  if (kind === 'coverView') {
    return (
      firstString(event, [
        'cover_view_url_expires_at',
        'coverViewUrlExpiresAt',
        'coverViewURLExpiresAt',
        'CoverViewURLExpiresAt',
        'CoverViewUrlExpiresAt',
      ]) ||
      firstString(event, [
        'view_url_expires_at',
        'viewUrlExpiresAt',
        'viewURLExpiresAt',
        'ViewURLExpiresAt',
        'ViewUrlExpiresAt',
      ])
    )
  }
  if (kind === 'view') {
    return firstString(event, [
      'view_url_expires_at',
      'viewUrlExpiresAt',
      'viewURLExpiresAt',
      'ViewURLExpiresAt',
      'ViewUrlExpiresAt',
    ])
  }
  return firstString(event, [
    'coverImageUrlExpiresAt',
    'coverImageURLExpiresAt',
    'CoverImageURLExpiresAt',
    'CoverImageUrlExpiresAt',
  ])
}

export function resolveEventCoverUrl(
  event: EventCoverSource | null | undefined,
  backendUrl: string | null | undefined
): string {
  return resolveBackendMediaUrl(eventCoverDisplaySource(event), backendUrl)
}

export function getEventCoverExpiry(event: EventCoverSource | null | undefined): Date | null {
  const explicitExpiry = eventCoverDisplayExpiresAt(event)
  if (explicitExpiry) {
    const parsed = new Date(explicitExpiry)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return getPresignedUrlExpiry(eventCoverDisplaySource(event))
}

export function getEventCoversRefreshDelay(
  events: Array<EventCoverSource | null | undefined>,
  now = Date.now(),
  skewMs = EVENT_COVER_REFRESH_SKEW_MS
): number | null {
  return getMediaRefreshDelay(
    events.map((event) => getEventCoverExpiry(event)),
    now,
    skewMs
  )
}

export function eventCoversMediaRefreshKey(events: Array<EventCoverSource | null | undefined>): string {
  return events
    .map((event) => {
      if (!event) return ''
      return [eventCoverId(event), eventCoverDisplaySource(event), eventCoverDisplayExpiresAt(event)].join(':')
    })
    .join('|')
}
