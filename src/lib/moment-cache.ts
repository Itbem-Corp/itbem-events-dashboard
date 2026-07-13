import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { cacheRecordId } from '@/lib/cache-record'
import { normalizeKeys } from '@/lib/normalizer'
import { getMediaRefreshDelay, getPresignedUrlExpiry } from '@/lib/signed-media'
import type { Moment } from '@/models/Moment'

type RecordValue = Record<string, unknown>
type MomentMediaSource = Partial<
  Pick<
    Moment,
    | 'content_url'
    | 'content_url_expires_at'
    | 'content_view_url'
    | 'content_view_url_expires_at'
    | 'thumbnail_url'
    | 'thumbnail_url_expires_at'
    | 'thumbnail_view_url'
    | 'thumbnail_view_url_expires_at'
  >
> & {
  id?: string | number
  ID?: string | number
  Id?: string | number
  contentUrl?: string
  ContentURL?: string
  ContentUrl?: string
  contentViewUrl?: string
  contentViewURL?: string
  ContentViewURL?: string
  ContentViewUrl?: string
  contentUrlExpiresAt?: string
  ContentURLExpiresAt?: string
  ContentUrlExpiresAt?: string
  contentViewUrlExpiresAt?: string
  contentViewURLExpiresAt?: string
  ContentViewURLExpiresAt?: string
  ContentViewUrlExpiresAt?: string
  thumbnailUrl?: string
  ThumbnailURL?: string
  ThumbnailUrl?: string
  thumbnailViewUrl?: string
  thumbnailViewURL?: string
  ThumbnailViewURL?: string
  ThumbnailViewUrl?: string
  thumbnailUrlExpiresAt?: string
  ThumbnailURLExpiresAt?: string
  ThumbnailUrlExpiresAt?: string
  thumbnailViewUrlExpiresAt?: string
  thumbnailViewURLExpiresAt?: string
  ThumbnailViewURLExpiresAt?: string
  ThumbnailViewUrlExpiresAt?: string
}

export const MOMENT_MEDIA_REFRESH_SKEW_MS = 60 * 1000

const CONTENT_URL_KEYS = [
  'content_view_url',
  'contentViewUrl',
  'contentViewURL',
  'ContentViewURL',
  'ContentViewUrl',
  'content_url',
  'contentUrl',
  'ContentURL',
  'ContentUrl',
]

const CONTENT_EXPIRY_KEYS = [
  'content_view_url_expires_at',
  'contentViewUrlExpiresAt',
  'contentViewURLExpiresAt',
  'ContentViewURLExpiresAt',
  'ContentViewUrlExpiresAt',
  'content_url_expires_at',
  'contentUrlExpiresAt',
  'ContentURLExpiresAt',
  'ContentUrlExpiresAt',
]

const THUMBNAIL_URL_KEYS = [
  'thumbnail_view_url',
  'thumbnailViewUrl',
  'thumbnailViewURL',
  'ThumbnailViewURL',
  'ThumbnailViewUrl',
  'thumbnail_url',
  'thumbnailUrl',
  'ThumbnailURL',
  'ThumbnailUrl',
]

const THUMBNAIL_EXPIRY_KEYS = [
  'thumbnail_view_url_expires_at',
  'thumbnailViewUrlExpiresAt',
  'thumbnailViewURLExpiresAt',
  'ThumbnailViewURLExpiresAt',
  'ThumbnailViewUrlExpiresAt',
  'thumbnail_url_expires_at',
  'thumbnailUrlExpiresAt',
  'ThumbnailURLExpiresAt',
  'ThumbnailUrlExpiresAt',
]

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

function normalizeProcessingStatus(value: unknown): Moment['processing_status'] | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (
    normalized === '' ||
    normalized === 'pending' ||
    normalized === 'processing' ||
    normalized === 'done' ||
    normalized === 'failed'
  ) {
    return normalized as Moment['processing_status']
  }
  return null
}

function normalizeMomentNumberFields(moment: RecordValue): RecordValue {
  const next = { ...moment }
  for (const key of ['order', 'processing_duration_ms', 'original_size_bytes', 'optimized_size_bytes']) {
    if (!(key in next)) continue
    const normalized = normalizeNonNegativeInt(next[key])
    if (normalized === null) delete next[key]
    else next[key] = normalized
  }
  return next
}

function normalizeMomentCacheRecord<T extends Partial<Moment>>(moment: T): T {
  const normalized = normalizeKeys(moment)
  if (!isRecord(normalized)) return moment

  const next = normalizeMomentNumberFields(normalized)
  if ('is_approved' in next) {
    const isApproved = normalizeBoolean(next.is_approved)
    if (isApproved === null) delete next.is_approved
    else next.is_approved = isApproved
  }
  if ('processing_status' in next) {
    const status = normalizeProcessingStatus(next.processing_status)
    if (status === null) delete next.processing_status
    else next.processing_status = status
  }

  return next as T
}

function firstString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null

  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
}

function parseExplicitExpiry(value: string | null): Date | null {
  if (!value) return null
  const expiry = new Date(value)
  return Number.isNaN(expiry.getTime()) ? null : expiry
}

function mediaExpiryFrom(source: MomentMediaSource, urlKeys: string[], expiryKeys: string[]): Date | null {
  const explicitExpiry = parseExplicitExpiry(firstString(source, expiryKeys))
  if (explicitExpiry) return explicitExpiry

  return getPresignedUrlExpiry(firstString(source, urlKeys))
}

function mapMomentListPayload(payload: unknown, mapper: (moments: Moment[]) => Moment[]): unknown {
  return mapApiListItems<Moment>(payload, mapper, { adjustTotal: true })
}

export function upsertMomentCacheValue(payload: unknown, moment: Moment | null | undefined): unknown {
  const targetId = cacheRecordId(moment)
  if (!targetId || !moment) return payload
  const nextMoment = normalizeMomentCacheRecord(moment)

  const updated = mapMomentListPayload(payload, (moments) => {
    const index = moments.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return [...moments, nextMoment]

    const next = [...moments]
    next[index] = { ...normalizeMomentCacheRecord(next[index]), ...nextMoment }
    return next
  })

  return updated === payload ? withApiData(payload, [nextMoment]) : updated
}

export function patchMomentsCacheValue(
  payload: unknown,
  momentIds: Iterable<string | number>,
  patch: Partial<Moment>
): unknown {
  const ids = new Set(Array.from(momentIds, (id) => String(id)))
  if (ids.size === 0) return payload
  const nextPatch = normalizeMomentCacheRecord(patch)

  return mapMomentListPayload(payload, (moments) =>
    moments.map((moment) =>
      ids.has(cacheRecordId(moment)) ? { ...normalizeMomentCacheRecord(moment), ...nextPatch } : moment
    )
  )
}

export function removeMomentsCacheValue(payload: unknown, momentIds: Iterable<string | number>): unknown {
  const ids = new Set(Array.from(momentIds, (id) => String(id)))
  if (ids.size === 0) return payload

  return mapMomentListPayload(payload, (moments) => moments.filter((moment) => !ids.has(cacheRecordId(moment))))
}

export function getMomentMediaExpiry<T extends MomentMediaSource>(moment: T): Date | null {
  const expiries = [
    mediaExpiryFrom(moment, CONTENT_URL_KEYS, CONTENT_EXPIRY_KEYS),
    mediaExpiryFrom(moment, THUMBNAIL_URL_KEYS, THUMBNAIL_EXPIRY_KEYS),
  ].filter((expiry): expiry is Date => expiry instanceof Date && !Number.isNaN(expiry.getTime()))

  if (expiries.length === 0) return null
  return new Date(Math.min(...expiries.map((expiry) => expiry.getTime())))
}

export function getMomentsRefreshDelay(
  moments: MomentMediaSource[],
  now = Date.now(),
  skewMs = MOMENT_MEDIA_REFRESH_SKEW_MS
): number | null {
  return getMediaRefreshDelay(
    moments.map((moment) => getMomentMediaExpiry(moment)),
    now,
    skewMs
  )
}

export function momentsMediaRefreshKey<T extends MomentMediaSource>(moments: T[]): string {
  return moments
    .map((moment) => {
      const contentUrl = firstString(moment, CONTENT_URL_KEYS)?.trim() ?? ''
      const thumbnailUrl = firstString(moment, THUMBNAIL_URL_KEYS)?.trim() ?? ''
      const contentExpiry =
        firstString(moment, CONTENT_EXPIRY_KEYS)?.trim() ?? getPresignedUrlExpiry(contentUrl)?.toISOString() ?? ''
      const thumbnailExpiry =
        firstString(moment, THUMBNAIL_EXPIRY_KEYS)?.trim() ?? getPresignedUrlExpiry(thumbnailUrl)?.toISOString() ?? ''

      return [cacheRecordId(moment), contentUrl, contentExpiry, thumbnailUrl, thumbnailExpiry].join(':')
    })
    .join('|')
}
