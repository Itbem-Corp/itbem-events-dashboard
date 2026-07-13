import { readResourceMediaUrl } from '@/lib/resource-media'
import { describe, expect, it } from 'vitest'

describe('readResourceMediaUrl', () => {
  const backendUrl = 'https://api.example.com/api'

  it('prefers the backend view_url contract', () => {
    expect(
      readResourceMediaUrl(
        {
          view_url: 'https://signed.example.com/photo.webp',
          url: 'https://alias.example.com/photo.webp',
          path: 'events/raw-photo.webp',
        },
        backendUrl
      )
    ).toBe('https://signed.example.com/photo.webp')
  })

  it('keeps absolute URL-like resource media unchanged', () => {
    expect(readResourceMediaUrl({ view_url: '//cdn.example.com/photo.webp' }, backendUrl)).toBe(
      '//cdn.example.com/photo.webp'
    )
    expect(readResourceMediaUrl({ view_url: 'data:image/webp;base64,AAAA' }, backendUrl)).toBe(
      'data:image/webp;base64,AAAA'
    )
  })

  it('falls back to the url alias returned by older resource payloads', () => {
    expect(
      readResourceMediaUrl(
        {
          url: 'https://alias.example.com/photo.webp',
          path: 'events/raw-photo.webp',
        },
        backendUrl
      )
    ).toBe('https://alias.example.com/photo.webp')
  })

  it('accepts raw Go and camelCase resource URL aliases', () => {
    expect(
      readResourceMediaUrl(
        {
          ViewURL: 'https://signed.example.com/go-photo.webp',
          URL: 'https://alias.example.com/go-photo.webp',
          Path: 'events/raw-photo.webp',
        },
        backendUrl
      )
    ).toBe('https://signed.example.com/go-photo.webp')

    expect(
      readResourceMediaUrl(
        {
          viewUrl: 'https://signed.example.com/camel-photo.webp',
        },
        backendUrl
      )
    ).toBe('https://signed.example.com/camel-photo.webp')

    expect(
      readResourceMediaUrl(
        {
          viewURL: 'https://signed.example.com/acronym-photo.webp',
        },
        backendUrl
      )
    ).toBe('https://signed.example.com/acronym-photo.webp')
  })

  it('resolves raw backend paths through the storage route', () => {
    expect(readResourceMediaUrl({ path: 'events/raw-photo.webp' }, backendUrl)).toBe(
      'https://api.example.com/storage/events/raw-photo.webp'
    )
    expect(readResourceMediaUrl({ object_key: 'events/object-photo.webp' }, backendUrl)).toBe(
      'https://api.example.com/storage/events/object-photo.webp'
    )
    expect(readResourceMediaUrl({ S3Key: 'events/s3-photo.webp' }, backendUrl)).toBe(
      'https://api.example.com/storage/events/s3-photo.webp'
    )
  })

  it('returns an empty string for missing resources', () => {
    expect(readResourceMediaUrl(null, backendUrl)).toBe('')
    expect(readResourceMediaUrl({}, backendUrl)).toBe('')
  })
})
