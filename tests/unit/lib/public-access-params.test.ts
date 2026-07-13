import {
  PUBLIC_ACCESS_DISPLAY_QUERY_KEYS,
  PUBLIC_EVENT_ACCESS_HEADER_NAME,
  PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
  PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
  PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
  PUBLIC_PREVIEW_MODE_QUERY_KEY,
  PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
  publicAccessLinkQueryParams,
} from '@/lib/public-access-params'
import { describe, expect, it } from 'vitest'

describe('public access params', () => {
  it('tracks backend-supported public access query aliases', () => {
    expect([...PUBLIC_INVITATION_TOKEN_QUERY_KEYS]).toEqual([
      'token',
      'Token',
      'invitation_token',
      'invitationToken',
      'InvitationToken',
      'pretty_token',
      'prettyToken',
      'PrettyToken',
    ])
    expect([...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS]).toEqual(['preview_token', 'previewToken', 'PreviewToken'])
    expect([...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS]).toEqual([
      'event_access_token',
      'eventAccessToken',
      'EventAccessToken',
    ])
  })

  it('uses one display sanitization list for public links', () => {
    expect([...PUBLIC_ACCESS_DISPLAY_QUERY_KEYS]).toEqual([
      PUBLIC_PREVIEW_MODE_QUERY_KEY,
      PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY,
      ...PUBLIC_PREVIEW_TOKEN_QUERY_KEYS,
      ...PUBLIC_INVITATION_TOKEN_QUERY_KEYS,
      ...PUBLIC_EVENT_ACCESS_TOKEN_QUERY_KEYS,
    ])
    expect(PUBLIC_PREVIEW_MODE_QUERY_KEY).toBe('preview')
    expect(PUBLIC_PREVIEW_CACHE_KEY_QUERY_KEY).toBe('t')
    expect(PUBLIC_EVENT_ACCESS_HEADER_NAME).toBe('X-Event-Access-Token')
  })

  it('builds canonical public link query params for both public frontends', () => {
    expect(
      publicAccessLinkQueryParams({
        cacheKey: ' 42 ',
        previewToken: ' preview/123 ',
        invitationToken: ' invite/123 ',
        accessToken: ' proof/123 ',
      })
    ).toEqual({
      preview: '1',
      t: '42',
      preview_token: 'preview/123',
      token: 'invite/123',
      event_access_token: 'proof/123',
    })

    expect(publicAccessLinkQueryParams({ cacheKey: '42' })).toEqual({
      preview: undefined,
      t: undefined,
      preview_token: undefined,
      token: undefined,
      event_access_token: undefined,
    })
  })
})
