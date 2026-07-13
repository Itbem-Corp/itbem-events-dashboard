import {
  getPresignedUrlExpiry,
  getResourceMediaExpiry,
  getSectionResourcesRefreshDelay,
  hasResourceFileMutationData,
  isSectionResourcesCacheKey,
  patchResourceFileCacheValue,
  removeResourceCacheValue,
  sectionResourcesMediaRefreshKey,
  sortResourcesByRenderOrder,
  upsertResourceCacheValue,
} from '@/lib/resource-cache'
import type { Resource } from '@/models/Resource'
import { describe, expect, it } from 'vitest'

function resource(id: string, patch: Partial<Resource> = {}): Resource {
  return {
    id,
    event_section_id: 'section-1',
    resource_type_id: 'image-type',
    position: 0,
    title: `Resource ${id}`,
    view_url: `https://cdn.example.com/${id}.webp`,
    ...patch,
  } as Resource
}

const imageType = {
  id: 'image-type',
  code: 'image',
  label: 'Image',
  created_at: '2026-03-01T12:00:00.000Z',
  updated_at: '2026-03-01T12:00:00.000Z',
}

function presignedUrl(date: string, expires: number): string {
  return `https://cdn.example.com/photo.webp?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=test`
}

describe('isSectionResourcesCacheKey', () => {
  it('matches only the exact admin section resources cache key', () => {
    expect(isSectionResourcesCacheKey('/admin/resources/section/section-1', 'section-1')).toBe(true)
    expect(isSectionResourcesCacheKey('/resources/section/section-1', 'section-1')).toBe(false)
    expect(isSectionResourcesCacheKey('/admin/resources/section/section-2', 'section-1')).toBe(false)
  })
})

describe('resource cache mutations', () => {
  it('upserts newly created resources in direct arrays', () => {
    expect(upsertResourceCacheValue([resource('res-1')], resource('res-2', { position: 1 }))).toEqual([
      resource('res-1'),
      resource('res-2', { position: 1 }),
    ])
  })

  it('keeps resources sorted by slot position with a stable id tie-break', () => {
    expect(
      sortResourcesByRenderOrder([
        resource('res-c', { position: 2 }),
        resource('res-b', { position: 1 }),
        resource('res-a', { position: 1 }),
      ]).map((item) => item.id)
    ).toEqual(['res-a', 'res-b', 'res-c'])

    expect(
      upsertResourceCacheValue(
        [resource('res-c', { position: 2 }), resource('res-a', { position: 1 })],
        resource('res-b', { position: 1 })
      )
    ).toEqual([
      resource('res-a', { position: 1 }),
      resource('res-b', { position: 1 }),
      resource('res-c', { position: 2 }),
    ])
  })

  it('merges updated resources without dropping relationship metadata', () => {
    expect(
      upsertResourceCacheValue(
        [
          resource('res-1', {
            resource_type: imageType,
          }),
        ],
        resource('res-1', { view_url: 'https://cdn.example.com/new.webp' })
      )
    ).toEqual([
      resource('res-1', {
        view_url: 'https://cdn.example.com/new.webp',
        resource_type: imageType,
      }),
    ])
  })

  it('seeds empty or envelope-only caches when creating a resource', () => {
    expect(upsertResourceCacheValue(undefined, resource('res-1'))).toEqual([resource('res-1')])
    expect(upsertResourceCacheValue({ status: 200, message: 'No data loaded' }, resource('res-1'))).toEqual({
      status: 200,
      message: 'No data loaded',
      data: [resource('res-1')],
    })
    expect(upsertResourceCacheValue({ Status: 200, Message: 'No data loaded' }, resource('res-1'))).toEqual({
      Status: 200,
      Message: 'No data loaded',
      Data: [resource('res-1')],
    })
  })

  it('normalizes adapter aliases when creating a resource', () => {
    const result = upsertResourceCacheValue(undefined, {
      ID: 'res-1',
      EventSectionID: 'section-1',
      ResourceTypeId: 'image-type',
      Title: 'Hero',
      AltText: 'Hero alt',
      ViewURL: 'https://cdn.example.com/hero.webp',
      ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      SortOrder: '2',
    } as unknown as Resource) as Resource[]

    expect(result).toEqual([
      expect.objectContaining({
        id: 'res-1',
        event_section_id: 'section-1',
        resource_type_id: 'image-type',
        title: 'Hero',
        alt_text: 'Hero alt',
        view_url: 'https://cdn.example.com/hero.webp',
        view_url_expires_at: '2026-03-01T12:05:00.000Z',
        position: 2,
      }),
    ])
  })

  it('skips blank canonical resource fields before reading backend aliases', () => {
    const result = upsertResourceCacheValue(undefined, {
      id: ' ',
      ID: 'res-1',
      event_section_id: ' ',
      EventSectionID: 'section-1',
      resource_type_id: ' ',
      ResourceTypeID: 'image-type',
      path: ' ',
      ObjectKey: 'events/section-1/hero.webp',
      view_url: ' ',
      ViewURL: 'https://cdn.example.com/hero.webp',
      view_url_expires_at: ' ',
      ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      alt_text: ' ',
      AltText: 'Hero alt',
      title: ' ',
      Title: 'Hero',
      position: ' ',
      SortOrder: '3',
    } as unknown as Resource) as Resource[]

    expect(result).toEqual([
      expect.objectContaining({
        id: 'res-1',
        event_section_id: 'section-1',
        resource_type_id: 'image-type',
        path: 'events/section-1/hero.webp',
        view_url: 'https://cdn.example.com/hero.webp',
        view_url_expires_at: '2026-03-01T12:05:00.000Z',
        alt_text: 'Hero alt',
        title: 'Hero',
        position: 3,
      }),
    ])
  })

  it('normalizes object-key aliases as raw resource paths', () => {
    const result = upsertResourceCacheValue(undefined, {
      Id: 'res-1',
      ObjectKey: 'events/base/hero/object.webp',
      S3Key: 'events/base/hero/s3.webp',
      ViewURL: 'https://cdn.example.com/hero.webp',
    } as unknown as Resource) as Resource[]

    expect(result).toEqual([
      expect.objectContaining({
        id: 'res-1',
        path: 'events/base/hero/object.webp',
        view_url: 'https://cdn.example.com/hero.webp',
      }),
    ])
  })

  it('normalizes adapter aliases when merging partial resource updates', () => {
    const result = upsertResourceCacheValue([resource('res-1', { resource_type: imageType })], {
      id: 'res-1',
      viewUrl: 'https://cdn.example.com/updated.webp',
      order: '3',
    } as unknown as Resource) as Resource[]

    expect(result).toEqual([
      resource('res-1', {
        view_url: 'https://cdn.example.com/updated.webp',
        position: 3,
        resource_type: imageType,
      }),
    ])
  })

  it('patches replaced file data in backend envelopes', () => {
    expect(
      patchResourceFileCacheValue(
        {
          status: 200,
          message: 'Resources loaded',
          data: { data: [resource('res-1'), resource('res-2')], total: 2 },
        },
        'res-1',
        {
          path: 'events/section-1/replaced.webp',
          url: 'https://cdn.example.com/replaced.webp',
          view_url: 'https://cdn.example.com/replaced.webp',
          view_url_expires_at: '2026-03-01T12:05:00.000Z',
        }
      )
    ).toEqual({
      status: 200,
      message: 'Resources loaded',
      data: {
        data: [
          resource('res-1', {
            path: 'events/section-1/replaced.webp',
            url: 'https://cdn.example.com/replaced.webp',
            view_url: 'https://cdn.example.com/replaced.webp',
            view_url_expires_at: '2026-03-01T12:05:00.000Z',
          }),
          resource('res-2'),
        ],
        total: 2,
      },
    })
  })

  it('patches replaced file data in Pascal-cased adapter envelopes', () => {
    expect(
      patchResourceFileCacheValue(
        {
          Status: 200,
          Message: 'Resources loaded',
          Data: { Items: [resource('res-1'), resource('res-2')], Total: 2 },
        },
        'res-1',
        {
          Path: 'events/section-1/replaced.webp',
          ViewURL: 'https://cdn.example.com/replaced.webp',
          ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
        }
      )
    ).toEqual({
      Status: 200,
      Message: 'Resources loaded',
      Data: {
        Items: [
          resource('res-1', {
            path: 'events/section-1/replaced.webp',
            url: 'https://cdn.example.com/replaced.webp',
            view_url: 'https://cdn.example.com/replaced.webp',
            view_url_expires_at: '2026-03-01T12:05:00.000Z',
          }),
          resource('res-2'),
        ],
        Total: 2,
      },
    })
  })

  it('updates the effective Data alias when canonical data is null', () => {
    expect(
      upsertResourceCacheValue(
        {
          Status: 200,
          Message: 'Resources loaded',
          data: null,
          Data: { Items: [resource('res-1')], Total: 1 },
        },
        resource('res-2', { position: 1 })
      )
    ).toEqual({
      Status: 200,
      Message: 'Resources loaded',
      data: null,
      Data: { Items: [resource('res-1'), resource('res-2', { position: 1 })], Total: 2 },
    })
  })

  it('updates non-empty resource list aliases before empty canonical list aliases', () => {
    expect(
      upsertResourceCacheValue(
        {
          status: 200,
          message: 'Resources loaded',
          data: {
            data: [],
            Items: [resource('res-1')],
            Total: 1,
          },
        },
        resource('res-2', { position: 1 })
      )
    ).toMatchObject({
      data: {
        data: [],
        Items: [
          expect.objectContaining({ id: 'res-1' }),
          expect.objectContaining({ id: 'res-2' }),
        ],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data resource pages before empty canonical containers', () => {
    const payload = {
      data: { items: [] },
      Data: {
        Items: [resource('res-1'), resource('res-2', { position: 1 })],
        Total: 2,
      },
    }

    expect(upsertResourceCacheValue(payload, resource('res-3', { position: 2 }))).toEqual({
      data: { items: [] },
      Data: {
        Items: [resource('res-1'), resource('res-2', { position: 1 }), resource('res-3', { position: 2 })],
        Total: 3,
      },
    })

    expect(
      patchResourceFileCacheValue(payload, 'res-1', {
        Path: 'events/section-1/replaced.webp',
        ViewURL: 'https://cdn.example.com/replaced.webp',
      })
    ).toEqual({
      data: { items: [] },
      Data: {
        Items: [
          resource('res-1', {
            path: 'events/section-1/replaced.webp',
            url: 'https://cdn.example.com/replaced.webp',
            view_url: 'https://cdn.example.com/replaced.webp',
          }),
          resource('res-2', { position: 1 }),
        ],
        Total: 2,
      },
    })

    expect(removeResourceCacheValue(payload, 'res-1')).toEqual({
      data: { items: [] },
      Data: {
        Items: [resource('res-2', { position: 1 })],
        Total: 1,
      },
    })
  })

  it('patches replaced file data from raw Go and camelCase payloads', () => {
    const payload = [resource('res-1')]
    const rawGoPayload = {
      Path: 'events/base/hero/go.webp',
      URL: 'https://cdn.example.com/go.webp',
      ViewURL: 'https://cdn.example.com/go.webp',
      ViewURLExpiresAt: '2026-03-01T12:10:00.000Z',
    }

    expect(hasResourceFileMutationData(rawGoPayload)).toBe(true)
    expect(patchResourceFileCacheValue(payload, 'res-1', rawGoPayload)).toEqual([
      resource('res-1', {
        path: 'events/base/hero/go.webp',
        url: 'https://cdn.example.com/go.webp',
        view_url: 'https://cdn.example.com/go.webp',
        view_url_expires_at: '2026-03-01T12:10:00.000Z',
      }),
    ])

    expect(
      patchResourceFileCacheValue(payload, 'res-1', {
        ObjectKey: 'events/section-1/object-key.webp',
        ViewURL: 'https://cdn.example.com/object-key.webp',
      })
    ).toEqual([
      resource('res-1', {
        path: 'events/section-1/object-key.webp',
        url: 'https://cdn.example.com/object-key.webp',
        view_url: 'https://cdn.example.com/object-key.webp',
      }),
    ])

    expect(
      patchResourceFileCacheValue(payload, 'res-1', {
        path: 'events/section-1/camel.webp',
        viewUrl: 'https://cdn.example.com/camel.webp',
        viewUrlExpiresAt: '2026-03-01T12:15:00.000Z',
      })
    ).toEqual([
      resource('res-1', {
        path: 'events/section-1/camel.webp',
        url: 'https://cdn.example.com/camel.webp',
        view_url: 'https://cdn.example.com/camel.webp',
        view_url_expires_at: '2026-03-01T12:15:00.000Z',
      }),
    ])

    expect(
      patchResourceFileCacheValue(payload, 'res-1', {
        path: 'events/section-1/acronym.webp',
        viewURL: 'https://cdn.example.com/acronym.webp',
        viewURLExpiresAt: '2026-03-01T12:20:00.000Z',
      })
    ).toEqual([
      resource('res-1', {
        path: 'events/section-1/acronym.webp',
        url: 'https://cdn.example.com/acronym.webp',
        view_url: 'https://cdn.example.com/acronym.webp',
        view_url_expires_at: '2026-03-01T12:20:00.000Z',
      }),
    ])
  })

  it('removes deleted resources without dropping envelope metadata', () => {
    expect(
      removeResourceCacheValue(
        {
          status: 200,
          message: 'Resources loaded',
          data: { items: [resource('res-1'), resource('res-2')], total: 2, page: 1 },
        },
        'res-1'
      )
    ).toEqual({
      status: 200,
      message: 'Resources loaded',
      data: { items: [resource('res-2')], total: 1, page: 1 },
    })
  })

  it('removes deleted resources from Pascal-cased adapter envelopes', () => {
    expect(
      removeResourceCacheValue(
        {
          Status: 200,
          Message: 'Resources loaded',
          Data: { Items: [resource('res-1'), resource('res-2')], Total: 2, Page: 1 },
        },
        'res-1'
      )
    ).toEqual({
      Status: 200,
      Message: 'Resources loaded',
      Data: { Items: [resource('res-2')], Total: 1, Page: 1 },
    })
  })
})

describe('resource media expiry', () => {
  it('parses AWS presigned URL expirations', () => {
    expect(getPresignedUrlExpiry(presignedUrl('20260301T120000Z', 120))?.toISOString()).toBe('2026-03-01T12:02:00.000Z')
  })

  it('parses signed epoch-second URL expirations conservatively', () => {
    const expires = Math.floor(Date.parse('2026-03-01T12:03:00.000Z') / 1000)

    expect(
      getPresignedUrlExpiry(
        `https://cdn.example.com/photo.webp?Expires=${expires}&Signature=sig&Key-Pair-Id=key`
      )?.toISOString()
    ).toBe('2026-03-01T12:03:00.000Z')
    expect(getPresignedUrlExpiry(`https://cdn.example.com/photo.webp?Expires=${expires}`)).toBeNull()
  })

  it('prefers explicit backend expiration metadata over URL parsing', () => {
    expect(
      getResourceMediaExpiry({
        view_url: presignedUrl('20260301T120000Z', 3600),
        view_url_expires_at: '2026-03-01T12:05:00.000Z',
      })?.toISOString()
    ).toBe('2026-03-01T12:05:00.000Z')
  })

  it('uses legacy URL aliases when computing media freshness', () => {
    const url = presignedUrl('20260301T120000Z', 600)
    const now = Date.parse('2026-03-01T12:00:00.000Z')

    expect(getResourceMediaExpiry({ url })?.toISOString()).toBe('2026-03-01T12:10:00.000Z')
    expect(
      getSectionResourcesRefreshDelay(
        [{ URL: 'https://cdn.example.com/static.webp', ViewURLExpiresAt: '2026-03-01T12:03:00.000Z' }],
        now,
        60_000
      )
    ).toBe(120_000)
    expect(
      sectionResourcesMediaRefreshKey([
        { ViewURL: 'https://signed.example.com/legacy.webp', ViewURLExpiresAt: '2026-03-01T12:05:00.000Z' },
      ])
    ).toBe('https://signed.example.com/legacy.webp:2026-03-01T12:05:00.000Z')
  })

  it('computes the next refresh delay before the earliest resource expiration', () => {
    const now = Date.parse('2026-03-01T12:00:00.000Z')
    expect(
      getSectionResourcesRefreshDelay(
        [
          { view_url: presignedUrl('20260301T120000Z', 600) },
          { view_url: 'https://cdn.example.com/static.webp', view_url_expires_at: '2026-03-01T12:03:00.000Z' },
        ],
        now,
        60_000
      )
    ).toBe(120_000)
  })

  it('builds a stable media refresh key from resource URLs and expirations', () => {
    expect(
      sectionResourcesMediaRefreshKey([
        {
          view_url: 'https://signed.example.com/hero.webp',
          view_url_expires_at: '2026-03-01T12:05:00.000Z',
        },
        { view_url: 'https://signed.example.com/logo.webp' },
      ])
    ).toBe('https://signed.example.com/hero.webp:2026-03-01T12:05:00.000Z|https://signed.example.com/logo.webp:')
  })
})
