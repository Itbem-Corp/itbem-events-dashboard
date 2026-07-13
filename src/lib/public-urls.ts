import { normalizeBaseUrl } from '@/lib/base-url'
import {
  PUBLIC_ACCESS_DISPLAY_QUERY_KEYS,
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  publicAccessLinkQueryParams,
  type PublicAccessLinkParams,
} from '@/lib/public-access-params'
import type { Guest } from '@/models/Guest'

export const PUBLIC_FRONTEND_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_ASTRO_URL, 'https://www.eventiapp.com.mx')

export type PublicPreviewLinkParams = PublicAccessLinkParams

type PreviewParamsInput = PublicPreviewLinkParams | string | number | null | undefined

function normalizePublicPathSegment(segment: string | number): string {
  const raw = String(segment).trim()
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function publicPath(...segments: Array<string | number>): string {
  return `${PUBLIC_FRONTEND_URL}/${segments.map((segment) => encodeURIComponent(normalizePublicPathSegment(segment))).join('/')}`
}

function withPublicAccessParams(url: string, params?: PublicPreviewLinkParams): string {
  const queryParams = publicAccessLinkQueryParams(params)
  if (!Object.values(queryParams).some(Boolean)) return url

  const previewUrl = new URL(url)
  for (const [key, value] of Object.entries(queryParams)) {
    if (value) previewUrl.searchParams.set(key, value)
  }
  return previewUrl.toString()
}

function previewParams(
  cacheKey?: string | number | null,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): PublicPreviewLinkParams {
  return { cacheKey, previewToken, invitationToken, accessToken }
}

function resolvePreviewParams(
  paramsOrCacheKey?: PreviewParamsInput,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): PublicPreviewLinkParams {
  if (paramsOrCacheKey && typeof paramsOrCacheKey === 'object') return paramsOrCacheKey
  return previewParams(paramsOrCacheKey, previewToken, invitationToken, accessToken)
}

export function getEventPublicUrl(identifier: string): string {
  return publicPath('e', identifier)
}

export function getEventPublicUrlPrefix(): string {
  return `${PUBLIC_FRONTEND_URL}/e/`
}

export function getEventMomentsUrl(identifier: string): string {
  return `${getEventPublicUrl(identifier)}/momentos`
}

export function getEventTvUrl(identifier: string): string {
  return `${getEventPublicUrl(identifier)}/tv`
}

export function getEventUploadUrl(identifier: string): string {
  return publicPath('events', identifier, 'upload')
}

export function getEventUploadPreviewUrl(identifier: string, params?: PublicPreviewLinkParams): string
export function getEventUploadPreviewUrl(
  identifier: string,
  cacheKey?: string | number | null,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string
export function getEventUploadPreviewUrl(
  identifier: string,
  paramsOrCacheKey?: PreviewParamsInput,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string {
  return withPublicAccessParams(
    getEventUploadUrl(identifier),
    resolvePreviewParams(paramsOrCacheKey, previewToken, invitationToken, accessToken)
  )
}

export function getEventPreviewUrl(identifier: string, params?: PublicPreviewLinkParams): string
export function getEventPreviewUrl(
  identifier: string,
  cacheKey?: string | number | null,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string
export function getEventPreviewUrl(
  identifier: string,
  paramsOrCacheKey?: PreviewParamsInput,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string {
  return withPublicAccessParams(
    getEventPublicUrl(identifier),
    resolvePreviewParams(paramsOrCacheKey, previewToken, invitationToken, accessToken)
  )
}

export function getEventMomentsPreviewUrl(identifier: string, params?: PublicPreviewLinkParams): string
export function getEventMomentsPreviewUrl(
  identifier: string,
  cacheKey?: string | number | null,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string
export function getEventMomentsPreviewUrl(
  identifier: string,
  paramsOrCacheKey?: PreviewParamsInput,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string {
  return withPublicAccessParams(
    getEventMomentsUrl(identifier),
    resolvePreviewParams(paramsOrCacheKey, previewToken, invitationToken, accessToken)
  )
}

export function getEventTvPreviewUrl(identifier: string, params?: PublicPreviewLinkParams): string
export function getEventTvPreviewUrl(
  identifier: string,
  cacheKey?: string | number | null,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string
export function getEventTvPreviewUrl(
  identifier: string,
  paramsOrCacheKey?: PreviewParamsInput,
  previewToken?: string | null,
  invitationToken?: string | null,
  accessToken?: string | null
): string {
  return withPublicAccessParams(
    getEventTvUrl(identifier),
    resolvePreviewParams(paramsOrCacheKey, previewToken, invitationToken, accessToken)
  )
}

type GuestRsvpTokenCarrier = Pick<Guest, 'pretty_token'> & {
  prettyToken?: string | null
  PrettyToken?: string | null
  token?: string | null
  Token?: string | null
  invitation_token?: string | null
  invitationToken?: string | null
  InvitationToken?: string | null
}

export function getGuestRsvpToken(guest: GuestRsvpTokenCarrier): string {
  return (
    guest.pretty_token?.trim() ||
    guest.prettyToken?.trim() ||
    guest.PrettyToken?.trim() ||
    guest.token?.trim() ||
    guest.Token?.trim() ||
    guest.invitation_token?.trim() ||
    guest.invitationToken?.trim() ||
    guest.InvitationToken?.trim() ||
    ''
  )
}

export function hasGuestRsvpToken(guest: GuestRsvpTokenCarrier): boolean {
  return getGuestRsvpToken(guest) !== ''
}

export function getGuestRsvpUrl(guest: GuestRsvpTokenCarrier, eventIdentifier: string): string {
  const token = getGuestRsvpToken(guest)
  if (token) {
    const rsvpUrl = new URL(publicPath('rsvp', eventIdentifier))
    rsvpUrl.searchParams.set(PUBLIC_INVITATION_TOKEN_QUERY_KEYS[0], token)
    return rsvpUrl.toString()
  }
  return getEventPublicUrl(eventIdentifier)
}

export function sanitizePublicAccessDisplayUrl(candidate: string): string {
  if (!candidate) return ''

  const trimmed = candidate.trim()
  const relativeCandidate =
    trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('?')

  try {
    const url = relativeCandidate ? new URL(trimmed, 'https://eventiapp.local') : new URL(candidate)
    for (const param of PUBLIC_ACCESS_DISPLAY_QUERY_KEYS) {
      url.searchParams.delete(param)
    }
    if (relativeCandidate) {
      if (trimmed.startsWith('?')) return `${url.search}${url.hash}`
      if (trimmed.startsWith('//')) return `//${url.host}${url.pathname}${url.search}${url.hash}`
      return `${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    return candidate
  }
}
