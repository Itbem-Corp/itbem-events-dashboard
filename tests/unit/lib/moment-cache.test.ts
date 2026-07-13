import { describe, expect, it } from 'vitest'

import {
  getMomentMediaExpiry,
  getMomentsRefreshDelay,
  momentsMediaRefreshKey,
  patchMomentsCacheValue,
  removeMomentsCacheValue,
  upsertMomentCacheValue,
} from '@/lib/moment-cache'
import type { Moment } from '@/models/Moment'

function moment(overrides: Partial<Moment> = {}): Moment {
  return {
    id: 'moment-1',
    content_url: 'moments/event/optimized/photo.webp',
    is_approved: false,
    processing_status: 'done',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Moment
}

function signedUrl(date = '20260101T120000Z', expires = 300, signature = 'test'): string {
  return `https://cdn.example.com/photo.jpg?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=${signature}`
}

describe('moment cache helpers', () => {
  it('upserts moments in plain array payloads', () => {
    const current = [moment({ id: 'moment-1', description: 'old' })]
    expect(upsertMomentCacheValue(current, moment({ id: 'moment-1', description: 'new' }))).toEqual([
      expect.objectContaining({ id: 'moment-1', description: 'new' }),
    ])

    expect(upsertMomentCacheValue(current, moment({ id: 'moment-2' }))).toHaveLength(2)
  })

  it('normalizes backend aliases when upserting moment records', () => {
    const savedMoment = {
      ID: 'moment-1',
      EventID: 'event-1',
      InvitationID: 'invite-1',
      Title: 'Entrada',
      ContentURL: 'moments/event/optimized/photo.webp',
      ContentURLExpiresAt: '2026-03-01T12:05:00.000Z',
      ContentViewURL: 'https://signed.example.com/photo.webp',
      ContentViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      ThumbnailURL: 'moments/event/thumb.webp',
      ThumbnailURLExpiresAt: '2026-03-01T12:04:00.000Z',
      ThumbnailViewURL: 'https://signed.example.com/thumb.webp',
      ThumbnailViewURLExpiresAt: '2026-03-01T12:04:00.000Z',
      IsApproved: true,
      ProcessingStatus: 'done',
      ProcessingDurationMs: 2300,
      OriginalSizeBytes: '12000',
      OptimizedSizeBytes: '3200',
      ContentType: 'image/webp',
      ErrorMessage: '',
    } as unknown as Moment

    expect(upsertMomentCacheValue(undefined, savedMoment)).toEqual([
      {
        id: 'moment-1',
        event_id: 'event-1',
        invitation_id: 'invite-1',
        title: 'Entrada',
        content_url: 'moments/event/optimized/photo.webp',
        content_url_expires_at: '2026-03-01T12:05:00.000Z',
        content_view_url: 'https://signed.example.com/photo.webp',
        content_view_url_expires_at: '2026-03-01T12:05:00.000Z',
        thumbnail_url: 'moments/event/thumb.webp',
        thumbnail_url_expires_at: '2026-03-01T12:04:00.000Z',
        thumbnail_view_url: 'https://signed.example.com/thumb.webp',
        thumbnail_view_url_expires_at: '2026-03-01T12:04:00.000Z',
        is_approved: true,
        processing_status: 'done',
        processing_duration_ms: 2300,
        original_size_bytes: 12000,
        optimized_size_bytes: 3200,
        content_type: 'image/webp',
        error_message: '',
      },
    ])
  })

  it('normalizes processing status aliases before updating the cache', () => {
    expect(
      upsertMomentCacheValue(undefined, {
        ID: 'moment-1',
        ProcessingStatus: ' FAILED ',
      } as unknown as Moment)
    ).toEqual([
      {
        id: 'moment-1',
        processing_status: 'failed',
      },
    ])

    expect(
      upsertMomentCacheValue(undefined, {
        ID: 'moment-2',
        ProcessingStatus: 'ready',
      } as unknown as Moment)
    ).toEqual([
      {
        id: 'moment-2',
      },
    ])
  })

  it('normalizes patched moment aliases before merging cache records', () => {
    expect(
      patchMomentsCacheValue(
        [{ ID: 'moment-1', ContentURL: 'old.webp', IsApproved: false } as unknown as Moment],
        ['moment-1'],
        { ContentURL: 'new.webp', IsApproved: true } as unknown as Partial<Moment>
      )
    ).toEqual([
      {
        id: 'moment-1',
        content_url: 'new.webp',
        is_approved: true,
      },
    ])
  })

  it('patches and removes moments inside API envelope lists', () => {
    const payload = {
      status: 200,
      data: {
        data: [moment({ id: 'a' }), moment({ id: 'b' })],
        total: 2,
      },
    }

    expect(patchMomentsCacheValue(payload, ['b'], { is_approved: true })).toMatchObject({
      data: {
        data: [
          expect.objectContaining({ id: 'a', is_approved: false }),
          expect.objectContaining({ id: 'b', is_approved: true }),
        ],
        total: 2,
      },
    })

    expect(removeMomentsCacheValue(payload, ['a'])).toMatchObject({
      data: {
        data: [expect.objectContaining({ id: 'b' })],
        total: 1,
      },
    })
  })

  it('patches and removes moments inside Pascal-cased adapter payloads', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      Data: {
        Items: [moment({ id: 'a' }), moment({ id: 'b' })],
        Total: 2,
      },
    }

    expect(patchMomentsCacheValue(payload, ['b'], { is_approved: true })).toMatchObject({
      Data: {
        Items: [
          expect.objectContaining({ id: 'a', is_approved: false }),
          expect.objectContaining({ id: 'b', is_approved: true }),
        ],
        Total: 2,
      },
    })

    expect(removeMomentsCacheValue(payload, ['a'])).toMatchObject({
      Data: {
        Items: [expect.objectContaining({ id: 'b' })],
        Total: 1,
      },
    })
  })

  it('updates the effective Data alias when canonical data is null', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      data: null,
      Data: {
        Items: [moment({ id: 'a' }), moment({ id: 'b' })],
        Total: 2,
      },
    }

    expect(patchMomentsCacheValue(payload, ['b'], { is_approved: true })).toMatchObject({
      data: null,
      Data: {
        Items: [
          expect.objectContaining({ id: 'a', is_approved: false }),
          expect.objectContaining({ id: 'b', is_approved: true }),
        ],
        Total: 2,
      },
    })
  })

  it('updates non-empty list aliases before empty canonical list aliases', () => {
    const payload = {
      status: 200,
      message: 'ok',
      data: {
        data: [],
        Items: [moment({ id: 'a' }), moment({ id: 'b' })],
        Total: 2,
      },
    }

    expect(patchMomentsCacheValue(payload, ['b'], { is_approved: true })).toMatchObject({
      data: {
        data: [],
        Items: [
          expect.objectContaining({ id: 'a', is_approved: false }),
          expect.objectContaining({ id: 'b', is_approved: true }),
        ],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data moment pages before empty canonical containers', () => {
    const payload = {
      data: { items: [] },
      Data: {
        Items: [moment({ id: 'a' }), moment({ id: 'b' })],
        Total: 2,
      },
    }

    expect(patchMomentsCacheValue(payload, ['b'], { is_approved: true })).toMatchObject({
      data: { items: [] },
      Data: {
        Items: [
          expect.objectContaining({ id: 'a', is_approved: false }),
          expect.objectContaining({ id: 'b', is_approved: true }),
        ],
        Total: 2,
      },
    })

    expect(removeMomentsCacheValue(payload, ['a'])).toMatchObject({
      data: { items: [] },
      Data: {
        Items: [expect.objectContaining({ id: 'b' })],
        Total: 1,
      },
    })

    expect(upsertMomentCacheValue(payload, moment({ id: 'c' }))).toMatchObject({
      data: { items: [] },
      Data: {
        Items: [
          expect.objectContaining({ id: 'a' }),
          expect.objectContaining({ id: 'b' }),
          expect.objectContaining({ id: 'c' }),
        ],
        Total: 3,
      },
    })
  })

  it('seeds Pascal-cased envelope-only payloads without adding a lowercase data twin', () => {
    expect(upsertMomentCacheValue({ Status: 200, Message: 'No data loaded' }, moment({ id: 'a' }))).toEqual({
      Status: 200,
      Message: 'No data loaded',
      Data: [moment({ id: 'a' })],
    })
  })

  it('keeps unknown payloads untouched when there is no list to mutate', () => {
    const payload = { status: 200, data: { ok: true } }
    expect(removeMomentsCacheValue(payload, ['a'])).toBe(payload)
    expect(patchMomentsCacheValue(payload, ['a'], { is_approved: true })).toBe(payload)
  })

  it('finds the earliest explicit moment media expiry', () => {
    expect(
      getMomentMediaExpiry(
        moment({
          content_url_expires_at: '2026-01-01T12:10:00Z',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
          thumbnail_url_expires_at: '2026-01-01T12:05:00Z',
        })
      )?.toISOString()
    ).toBe('2026-01-01T12:05:00.000Z')
  })

  it('falls back to presigned query expiration metadata', () => {
    expect(
      getMomentMediaExpiry(
        moment({
          content_url: signedUrl('20260101T120000Z', 600),
          thumbnail_url: signedUrl('20260101T120000Z', 120),
        })
      )?.toISOString()
    ).toBe('2026-01-01T12:02:00.000Z')
  })

  it('prefers explicit view URL aliases for media expiry', () => {
    expect(
      getMomentMediaExpiry(
        moment({
          content_url: 'moments/event/raw-photo.webp',
          content_view_url: signedUrl('20260101T120000Z', 600),
          thumbnail_url: 'moments/event/raw-thumb.webp',
          thumbnail_view_url: signedUrl('20260101T120000Z', 120),
        })
      )?.toISOString()
    ).toBe('2026-01-01T12:02:00.000Z')
  })

  it('calculates a preventive refresh delay before media URLs expire', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')

    expect(
      getMomentsRefreshDelay(
        [
          moment({ content_url_expires_at: '2026-01-01T12:10:00Z' }),
          moment({ id: 'moment-2', content_url_expires_at: '2026-01-01T12:05:00Z' }),
        ],
        now,
        60_000
      )
    ).toBe(240_000)
  })

  it('returns null when moments do not expose expiring media', () => {
    expect(getMomentMediaExpiry(moment({ content_url: 'https://cdn.example.com/photo.jpg' }))).toBeNull()
    expect(getMomentsRefreshDelay([moment({ content_url: 'https://cdn.example.com/photo.jpg' })])).toBeNull()
  })

  it('keeps refresh keys stable across backend casing variants', () => {
    const viewUrl = signedUrl('20260101T120000Z', 600)

    expect(
      momentsMediaRefreshKey([
        {
          ID: 'moment-1',
          ContentURL: 'moments/event/raw-photo.webp',
          ContentViewURL: viewUrl,
          ThumbnailUrlExpiresAt: '2026-01-01T12:03:00Z',
        },
      ])
    ).toBe(`moment-1:${viewUrl}:2026-01-01T12:10:00.000Z::2026-01-01T12:03:00Z`)
  })

  it('includes signed media URLs in refresh keys even when expirations match', () => {
    const first = momentsMediaRefreshKey([
      moment({
        content_view_url: signedUrl('20260101T120000Z', 600, 'first'),
        content_view_url_expires_at: '2026-01-01T12:10:00Z',
      }),
    ])
    const second = momentsMediaRefreshKey([
      moment({
        content_view_url: signedUrl('20260101T120000Z', 600, 'second'),
        content_view_url_expires_at: '2026-01-01T12:10:00Z',
      }),
    ])

    expect(first).not.toBe(second)
  })
})
