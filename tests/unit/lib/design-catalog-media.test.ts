import {
  designCatalogMediaRefreshKey,
  getDesignCatalogFontExpiry,
  getDesignCatalogMediaRefreshDelay,
  getDesignTemplatePreviewExpiry,
} from '@/lib/design-catalog-media'
import { describe, expect, it } from 'vitest'

function presignedUrl(date: string, expires: number): string {
  return `https://signed.example.com/media.webp?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=abc`
}

describe('design catalog signed media', () => {
  const now = new Date('2026-03-01T12:00:00.000Z').getTime()

  it('uses explicit signed preview expiration metadata first', () => {
    expect(
      getDesignTemplatePreviewExpiry({
        preview_view_url: presignedUrl('20260301T120000Z', 600),
        preview_view_url_expires_at: '2026-03-01T12:02:00.000Z',
      })?.toISOString()
    ).toBe('2026-03-01T12:02:00.000Z')
  })

  it('falls back to AWS signed preview URL query params', () => {
    expect(
      getDesignTemplatePreviewExpiry({
        preview_view_url: presignedUrl('20260301T120000Z', 120),
      })?.toISOString()
    ).toBe('2026-03-01T12:02:00.000Z')
  })

  it('reads signed font expirations from normalized and raw Go catalog payloads', () => {
    expect(
      getDesignCatalogFontExpiry({
        ViewURL: 'https://signed.example.com/cormorant.woff2',
        ViewURLExpiresAt: '2026-03-01T12:04:00.000Z',
      })?.toISOString()
    ).toBe('2026-03-01T12:04:00.000Z')

    expect(
      getDesignCatalogFontExpiry({
        view_url: presignedUrl('20260301T120000Z', 180),
      })?.toISOString()
    ).toBe('2026-03-01T12:03:00.000Z')
  })

  it('refreshes catalogs before the earliest signed preview or font URL expires', () => {
    expect(
      getDesignCatalogMediaRefreshDelay(
        {
          templates: [
            {
              preview_view_url_expires_at: '2026-03-01T12:05:00.000Z',
              DefaultFontSet: {
                Patterns: [
                  {
                    Font: {
                      ViewURLExpiresAt: '2026-03-01T12:04:00.000Z',
                    },
                  },
                ],
              },
            },
          ],
          fontSets: [
            {
              patterns: [
                {
                  font: {
                    view_url: presignedUrl('20260301T120000Z', 90),
                  },
                },
              ],
            },
          ],
        },
        now,
        30_000
      )
    ).toBe(60_000)
  })

  it('uses non-empty font pattern aliases before empty canonical pattern lists', () => {
    expect(
      getDesignCatalogMediaRefreshDelay(
        {
          fontSets: [
            {
              patterns: [],
              Patterns: [
                {
                  Font: {
                    ViewURLExpiresAt: '2026-03-01T12:04:00.000Z',
                  },
                },
              ],
            },
          ],
        },
        now,
        30_000
      )
    ).toBe(210_000)
  })

  it('does not schedule refreshes for unsigned catalog media', () => {
    expect(
      getDesignCatalogMediaRefreshDelay(
        {
          templates: [{ preview_url: 'base/templates/classic.webp' }],
          fontSets: [{ patterns: [{ font: { url: 'base/fonts/inter.woff2' } }] }],
        },
        now
      )
    ).toBeNull()
  })

  it('uses non-empty nested font set aliases before empty records', () => {
    const fontUrl = presignedUrl('20260301T120000Z', 180)

    expect(
      designCatalogMediaRefreshKey({
        templates: [
          {
            preview_view_url: '',
            font_set: {},
            default_font_set: {},
            DefaultFontSet: {
              Patterns: [{ Font: { ViewURL: fontUrl } }],
            },
          },
        ],
      })
    ).toBe(`${fontUrl}:2026-03-01T12:03:00.000Z`)
  })

  it('builds a refresh key from signed previews and nested font URLs', () => {
    expect(
      designCatalogMediaRefreshKey({
        templates: [
          {
            preview_view_url: 'https://signed.example.com/classic.webp',
            preview_view_url_expires_at: '2026-03-01T12:05:00.000Z',
            DefaultFontSet: {
              Patterns: [{ Font: { ViewURL: presignedUrl('20260301T120000Z', 180) } }],
            },
          },
        ],
        fontSets: [
          {
            patterns: [
              {
                font: {
                  view_url: 'https://signed.example.com/inter.woff2',
                  view_url_expires_at: '2026-03-01T12:04:00.000Z',
                },
              },
            ],
          },
        ],
      })
    ).toBe(
      [
        'https://signed.example.com/classic.webp:2026-03-01T12:05:00.000Z',
        `${presignedUrl('20260301T120000Z', 180)}:2026-03-01T12:03:00.000Z`,
        'https://signed.example.com/inter.woff2:2026-03-01T12:04:00.000Z',
      ].join('|')
    )
  })
})
