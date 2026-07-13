import type { Guest } from '@/models/Guest'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadPublicUrlsWithAstroUrl(value: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_ASTRO_URL', value)
  return import('@/lib/public-urls')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('public URLs from NEXT_PUBLIC_ASTRO_URL', () => {
  it('preserves public frontend subpaths for event, RSVP, preview, and upload URLs', async () => {
    const {
      getEventMomentsPreviewUrl,
      getEventPreviewUrl,
      getEventPublicUrlPrefix,
      getEventPublicUrl,
      getEventTvPreviewUrl,
      getEventUploadPreviewUrl,
      getEventUploadUrl,
      getGuestRsvpUrl,
    } = await loadPublicUrlsWithAstroUrl('https://preview.example.com/eventi-public/')

    expect(getEventPublicUrl('evento especial')).toBe(
      'https://preview.example.com/eventi-public/e/evento%20especial'
    )
    expect(getEventPublicUrlPrefix()).toBe(
      'https://preview.example.com/eventi-public/e/'
    )
    expect(getEventPreviewUrl('evento especial', 7, ' preview/123 ')).toBe(
      'https://preview.example.com/eventi-public/e/evento%20especial?preview=1&t=7&preview_token=preview%2F123'
    )
    expect(getEventPreviewUrl('evento especial', 7, ' preview/123 ', ' invite/123 ')).toBe(
      'https://preview.example.com/eventi-public/e/evento%20especial?preview=1&t=7&preview_token=preview%2F123&token=invite%2F123'
    )
    expect(getEventMomentsPreviewUrl('evento especial', 7, ' preview/123 ', ' invite/123 ')).toBe(
      'https://preview.example.com/eventi-public/e/evento%20especial/momentos?preview=1&t=7&preview_token=preview%2F123&token=invite%2F123'
    )
    expect(getEventTvPreviewUrl('evento especial', 7, ' preview/123 ', ' invite/123 ')).toBe(
      'https://preview.example.com/eventi-public/e/evento%20especial/tv?preview=1&t=7&preview_token=preview%2F123&token=invite%2F123'
    )
    expect(getEventUploadUrl('evento especial/2026')).toBe(
      'https://preview.example.com/eventi-public/events/evento%20especial%2F2026/upload'
    )
    expect(getEventUploadPreviewUrl('evento especial/2026', 7, ' preview/123 ', ' invite/123 ', ' proof/123 ')).toBe(
      'https://preview.example.com/eventi-public/events/evento%20especial%2F2026/upload?preview=1&t=7&preview_token=preview%2F123&token=invite%2F123&event_access_token=proof%2F123'
    )
    expect(getGuestRsvpUrl({ pretty_token: ' token/123 ' } as Guest, 'evento especial')).toBe(
      'https://preview.example.com/eventi-public/rsvp/evento%20especial?token=token%2F123'
    )
  })
})
