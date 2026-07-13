import { describe, expect, it } from 'vitest'

import {
  eventCoverDisplayExpiresAt,
  eventCoverDisplaySource,
  eventCoverRawSource,
  eventCoversMediaRefreshKey,
  getEventCoverExpiry,
  getEventCoversRefreshDelay,
  resolveEventCoverUrl,
} from '@/lib/event-media'

type CoverSource = NonNullable<Parameters<typeof eventCoverDisplaySource>[0]>

function presignedUrl(date: string, expires: number): string {
  return `https://cdn.example.com/cover.webp?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=test`
}

describe('eventCoverDisplaySource', () => {
  it('prefers signed cover view URLs over raw storage keys', () => {
    expect(
      eventCoverDisplaySource({
        cover_image_url: 'events/event-1/cover.webp',
        cover_view_url: 'https://signed.example.com/cover.webp',
      })
    ).toBe('https://signed.example.com/cover.webp')
  })

  it('accepts backend and adapter casing aliases for signed covers', () => {
    expect(
      eventCoverDisplaySource({
        cover_image_url: 'events/event-1/raw.webp',
        coverViewUrl: ' ',
        ViewURL: 'https://signed.example.com/view.webp',
      } as CoverSource)
    ).toBe('https://signed.example.com/view.webp')

    expect(
      eventCoverDisplaySource({
        CoverImageURL: 'events/event-1/cover.webp',
      } as CoverSource)
    ).toBe('events/event-1/cover.webp')
  })

  it('falls back to raw storage keys when no display URL exists', () => {
    expect(eventCoverDisplaySource({ cover_image_url: 'events/event-1/cover.webp' })).toBe('events/event-1/cover.webp')
  })
})

describe('eventCoverRawSource', () => {
  it('reads only the raw cover key across backend and adapter aliases', () => {
    expect(
      eventCoverRawSource({
        CoverImageUrl: 'events/event-1/raw.webp',
        CoverViewURL: 'https://signed.example.com/cover.webp',
      } as CoverSource)
    ).toBe('events/event-1/raw.webp')
  })
})

describe('eventCoverDisplayExpiresAt', () => {
  it('reads the expiration attached to the preferred signed cover URL', () => {
    expect(
      eventCoverDisplayExpiresAt({
        cover_image_url: 'events/event-1/cover.webp',
        cover_view_url: 'https://signed.example.com/cover.webp',
        cover_view_url_expires_at: '2026-03-01T12:05:00.000Z',
        view_url_expires_at: '2026-03-01T12:04:00.000Z',
      })
    ).toBe('2026-03-01T12:05:00.000Z')
  })

  it('reads expiration aliases attached to the selected signed cover', () => {
    expect(
      eventCoverDisplayExpiresAt({
        coverViewURL: ' ',
        ViewURL: 'https://signed.example.com/view.webp',
        ViewURLExpiresAt: '2026-03-01T12:04:00.000Z',
        CoverViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      } as CoverSource)
    ).toBe('2026-03-01T12:04:00.000Z')
  })
})

describe('event cover expiry refresh', () => {
  it('prefers explicit backend expiration metadata over URL parsing', () => {
    expect(
      getEventCoverExpiry({
        cover_view_url: presignedUrl('20260301T120000Z', 3600),
        cover_view_url_expires_at: '2026-03-01T12:05:00.000Z',
      })?.toISOString()
    ).toBe('2026-03-01T12:05:00.000Z')
  })

  it('falls back to AWS presigned URL expiration parsing', () => {
    expect(
      getEventCoverExpiry({
        cover_view_url: presignedUrl('20260301T120000Z', 120),
      })?.toISOString()
    ).toBe('2026-03-01T12:02:00.000Z')
  })

  it('computes the next refresh delay before the earliest cover expiration', () => {
    const now = Date.parse('2026-03-01T12:00:00.000Z')
    expect(
      getEventCoversRefreshDelay(
        [
          { cover_view_url: presignedUrl('20260301T120000Z', 600) },
          {
            cover_view_url: 'https://cdn.example.com/static.webp',
            view_url_expires_at: '2026-03-01T12:03:00.000Z',
          },
        ],
        now,
        60_000
      )
    ).toBe(120_000)
  })

  it('builds a stable refresh key from event id, display URL, and expiration aliases', () => {
    expect(
      eventCoversMediaRefreshKey([
        {
          ID: 'event-1',
          CoverImageURL: 'events/event-1/cover.webp',
          CoverViewURL: 'https://signed.example.com/cover.webp',
          CoverViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
        } as CoverSource,
      ])
    ).toBe('event-1:https://signed.example.com/cover.webp:2026-03-01T12:05:00.000Z')
  })
})

describe('resolveEventCoverUrl', () => {
  it('resolves raw cover keys through the backend storage route', () => {
    expect(resolveEventCoverUrl({ cover_image_url: 'events/event-1/cover.webp' }, 'https://api.example.com/api')).toBe(
      'https://api.example.com/storage/events/event-1/cover.webp'
    )
  })
})
