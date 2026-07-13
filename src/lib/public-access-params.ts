export const PUBLIC_PREVIEW_MODE_QUERY_KEY = 'preview'

export const PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY = 't'

export const PUBLIC_PREVIEW_TOKEN_QUERY_KEYS = ['preview_token', 'previewToken', 'PreviewToken'] as const

export const PUBLIC_INVITATION_TOKEN_QUERY_KEYS = [
  'token',
  'Token',
  'invitation_token',
  'invitationToken',
  'InvitationToken',
  'pretty_token',
  'prettyToken',
  'PrettyToken',
] as const

export const PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS = [
  'event_access_token',
  'eventAccessToken',
  'EventAccessToken',
] as const

export const PUBLIC_ACCESS_DISPLAY_QUERY_KEYS = [
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  ...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
  ...PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  ...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
] as const

export const PUBLIC_EVENT_ACCESS_HEADER_NAME = 'X-Event-Access-Token'

type PublicAccessQueryValue = string | undefined

export interface PublicAccessLinkParams {
  cacheKey?: string | number | null
  previewToken?: string | null
  invitationToken?: string | null
  accessToken?: string | null
}

const PUBLIC_PREVIEW_TOKEN_QUERY_KEY = PUBLIC_PREVIEW_TOKEN_QUERY_KEYS[0]
const PUBLIC_INVITATION_TOKEN_QUERY_KEY = PUBLIC_INVITATION_TOKEN_QUERY_KEYS[0]
const PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEY = PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS[0]

export function publicAccessLinkQueryParams({
  cacheKey,
  previewToken,
  invitationToken,
  accessToken,
}: PublicAccessLinkParams = {}): Record<string, PublicAccessQueryValue> {
  const cleanPreviewToken = previewToken?.trim() ?? ''
  const cleanCacheKey = cacheKey !== undefined && cacheKey !== null ? String(cacheKey).trim() : ''
  const cleanInvitationToken = invitationToken?.trim() ?? ''
  const cleanAccessToken = accessToken?.trim() ?? ''

  return {
    [PUBLIC_PREVIEW_MODE_QUERY_KEY]: cleanPreviewToken ? '1' : undefined,
    [PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY]: cleanPreviewToken && cleanCacheKey ? cleanCacheKey : undefined,
    [PUBLIC_PREVIEW_TOKEN_QUERY_KEY]: cleanPreviewToken || undefined,
    [PUBLIC_INVITATION_TOKEN_QUERY_KEY]: cleanInvitationToken || undefined,
    [PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEY]: cleanAccessToken || undefined,
  }
}
