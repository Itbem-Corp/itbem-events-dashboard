import {
  getEventMomentsPreviewUrl,
  getEventPreviewUrl,
  getEventPublicUrl,
  getEventPublicUrlPrefix,
  getEventTvPreviewUrl,
  getEventUploadPreviewUrl,
  getEventUploadUrl,
  getGuestRsvpToken,
  getGuestRsvpUrl,
  hasGuestRsvpToken,
  sanitizePublicAccessDisplayUrl,
} from '@/lib/public-urls'
import type { Guest } from '@/models/Guest'
import { describe, expect, it } from 'vitest'

describe('getEventPreviewUrl', () => {
  it('does not generate preview mode without a signed token', () => {
    expect(getEventPreviewUrl('mi-evento', 3)).toBe('https://www.eventiapp.com.mx/e/mi-evento')
  })

  it('adds the signed preview token when provided', () => {
    expect(getEventPreviewUrl('mi-evento', 3, ' token-123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=3&preview_token=token-123'
    )
  })

  it('preserves invitation tokens in preview links when present', () => {
    expect(getEventPreviewUrl('mi-evento', 3, ' preview/123 ', ' invite/123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=3&preview_token=preview%2F123&token=invite%2F123'
    )
  })

  it('builds preview links from explicit params objects', () => {
    expect(
      getEventPreviewUrl('mi-evento', {
        cacheKey: 3,
        previewToken: ' preview/123 ',
        invitationToken: ' invite/123 ',
        accessToken: ' proof/123 ',
      })
    ).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=3&preview_token=preview%2F123&token=invite%2F123&event_access_token=proof%2F123'
    )
  })

  it('can carry invitation access without marking the URL as Studio preview', () => {
    expect(getEventPreviewUrl('mi-evento', 3, '', ' invite/123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?token=invite%2F123'
    )
  })

  it('can carry verified event access without marking the URL as Studio preview', () => {
    expect(getEventPreviewUrl('mi-evento', 3, '', '', ' proof/123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?event_access_token=proof%2F123'
    )
  })

  it('builds moments preview URLs with the same preview contract', () => {
    expect(getEventMomentsPreviewUrl('mi-evento', 4, ' token-123 ', ' invite/123 ', ' proof/123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento/momentos?preview=1&t=4&preview_token=token-123&token=invite%2F123&event_access_token=proof%2F123'
    )
  })

  it('builds TV preview URLs with the same preview contract', () => {
    expect(getEventTvPreviewUrl('mi-evento', 5, ' token-123 ', ' invite/123 ', ' proof/123 ')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento/tv?preview=1&t=5&preview_token=token-123&token=invite%2F123&event_access_token=proof%2F123'
    )
  })

  it('builds shared upload preview URLs with the same preview contract', () => {
    expect(getEventUploadPreviewUrl('mi-evento', 6, ' token-123 ', ' invite/123 ', ' proof/123 ')).toBe(
      'https://www.eventiapp.com.mx/events/mi-evento/upload?preview=1&t=6&preview_token=token-123&token=invite%2F123&event_access_token=proof%2F123'
    )
  })
})

describe('public event URLs', () => {
  it('builds the editable event URL prefix from the same base as public links', () => {
    expect(getEventPublicUrlPrefix()).toBe('https://www.eventiapp.com.mx/e/')
  })

  it('encodes path identifiers', () => {
    expect(getEventPublicUrl('evento especial/2026')).toBe('https://www.eventiapp.com.mx/e/evento%20especial%2F2026')
  })

  it('does not double-encode route identifiers already encoded by the browser', () => {
    expect(getEventPublicUrl(' evento%20especial ')).toBe('https://www.eventiapp.com.mx/e/evento%20especial')
  })

  it('builds shared upload URLs with the identifier in the path', () => {
    expect(getEventUploadUrl('evento especial/2026')).toBe(
      'https://www.eventiapp.com.mx/events/evento%20especial%2F2026/upload'
    )
  })

  it('normalizes shared upload identifiers before adding path params', () => {
    expect(getEventUploadUrl(' evento%20especial ')).toBe(
      'https://www.eventiapp.com.mx/events/evento%20especial/upload'
    )
  })

  it('uses personalized RSVP tokens when present and falls back to the public event page', () => {
    expect(getGuestRsvpUrl({ pretty_token: ' token/123 ' } as Guest, 'evento especial')).toBe(
      'https://www.eventiapp.com.mx/rsvp/evento%20especial?token=token%2F123'
    )
    expect(getGuestRsvpUrl({ pretty_token: '' } as Guest, 'evento especial/2026')).toBe(
      'https://www.eventiapp.com.mx/e/evento%20especial%2F2026'
    )
  })

  it('reads RSVP token aliases used by backend and Cafetton contracts', () => {
    expect(getGuestRsvpToken({ prettyToken: ' CAMEL/123 ' })).toBe('CAMEL/123')
    expect(getGuestRsvpToken({ PrettyToken: ' PASCAL/123 ' })).toBe('PASCAL/123')
    expect(getGuestRsvpToken({ token: ' RAW/123 ' })).toBe('RAW/123')
    expect(getGuestRsvpToken({ Token: ' RAW-PASCAL/123 ' })).toBe('RAW-PASCAL/123')
    expect(getGuestRsvpToken({ invitation_token: ' INV/123 ' })).toBe('INV/123')
    expect(getGuestRsvpToken({ invitationToken: ' INV-CAMEL/123 ' })).toBe('INV-CAMEL/123')
    expect(getGuestRsvpToken({ InvitationToken: ' INV-PASCAL/123 ' })).toBe('INV-PASCAL/123')
    expect(hasGuestRsvpToken({ prettyToken: ' CAMEL/123 ' })).toBe(true)
    expect(hasGuestRsvpToken({ prettyToken: '   ', PrettyToken: null })).toBe(false)
    expect(getGuestRsvpUrl({ prettyToken: ' CAMEL/123 ' }, 'evento especial')).toBe(
      'https://www.eventiapp.com.mx/rsvp/evento%20especial?token=CAMEL%2F123'
    )
  })

  it('does not treat rsvp_token_id as a public RSVP token', () => {
    expect(
      getGuestRsvpToken({
        pretty_token: '',
        rsvp_token_id: 'access-token-row-id',
      } as Guest)
    ).toBe('')
    expect(
      getGuestRsvpUrl(
        {
          pretty_token: '',
          rsvp_token_id: 'access-token-row-id',
        } as Guest,
        'evento especial'
      )
    ).toBe('https://www.eventiapp.com.mx/e/evento%20especial')
  })
})

describe('sanitizePublicAccessDisplayUrl', () => {
  it('removes preview, invitation, and event access tokens from visible public URLs', () => {
    expect(
      sanitizePublicAccessDisplayUrl(
        'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=42&preview_token=preview-123&previewToken=preview-camel&PreviewToken=preview-pascal&token=invite-123&Token=invite-pascal&pretty_token=pretty-123&prettyToken=pretty-camel&PrettyToken=pretty-pascal&invitation_token=alias-123&invitationToken=alias-camel&InvitationToken=alias-pascal&event_access_token=proof-123&eventAccessToken=proof-camel&EventAccessToken=proof-pascal'
      )
    ).toBe('https://www.eventiapp.com.mx/e/mi-evento')
  })

  it('removes public access tokens from relative display URLs', () => {
    expect(
      sanitizePublicAccessDisplayUrl(
        '/e/mi-evento?preview=1&t=42&preview_token=preview-123&token=invite-123&event_access_token=proof-123&utm=qr#share'
      )
    ).toBe('/e/mi-evento?utm=qr#share')
    expect(sanitizePublicAccessDisplayUrl('?token=invite-123&eventAccessToken=proof-123&utm=qr')).toBe('?utm=qr')
  })

  it('keeps unrelated query params and leaves invalid URLs unchanged', () => {
    expect(sanitizePublicAccessDisplayUrl('https://www.eventiapp.com.mx/e/mi-evento?utm=qr')).toBe(
      'https://www.eventiapp.com.mx/e/mi-evento?utm=qr'
    )
    expect(sanitizePublicAccessDisplayUrl('not a url')).toBe('not a url')
  })
})
