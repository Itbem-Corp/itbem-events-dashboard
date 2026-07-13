import {
  isBackendVideoMedia,
  isBackendVideoMediaUrl,
  isRawMomentMediaPath,
  resolveBackendMediaUrl,
} from '@/lib/media-url'
import { describe, expect, it } from 'vitest'

describe('resolveBackendMediaUrl', () => {
  it('keeps absolute media URLs unchanged', () => {
    expect(resolveBackendMediaUrl('https://cdn.example.com/cover.webp', 'https://api.example.com')).toBe(
      'https://cdn.example.com/cover.webp'
    )
    expect(resolveBackendMediaUrl('blob:https://app.example/id', 'https://api.example.com')).toBe(
      'blob:https://app.example/id'
    )
    expect(resolveBackendMediaUrl('data:image/webp;base64,AAAA', 'https://api.example.com')).toBe(
      'data:image/webp;base64,AAAA'
    )
  })

  it('keeps protocol-relative CDN media URLs unchanged', () => {
    expect(resolveBackendMediaUrl('//cdn.example.com/cover.webp', 'https://api.example.com')).toBe(
      '//cdn.example.com/cover.webp'
    )
  })

  it('turns raw backend storage keys into public storage URLs', () => {
    expect(resolveBackendMediaUrl('events/abc/cover.webp', 'https://api.example.com///')).toBe(
      'https://api.example.com/storage/events/abc/cover.webp'
    )
  })

  it('does not duplicate the storage route', () => {
    expect(resolveBackendMediaUrl('/storage/events/abc/cover.webp', 'https://api.example.com')).toBe(
      'https://api.example.com/storage/events/abc/cover.webp'
    )
  })

  it('does not keep /api in backend media URLs', () => {
    expect(resolveBackendMediaUrl('/storage/events/abc/cover.webp', 'https://api.example.com/api')).toBe(
      'https://api.example.com/storage/events/abc/cover.webp'
    )
  })

  it('preserves backend subpaths before storage media URLs', () => {
    expect(resolveBackendMediaUrl('events/abc/cover.webp', 'https://staging.example.com/eventi-api/api')).toBe(
      'https://staging.example.com/eventi-api/storage/events/abc/cover.webp'
    )
  })
})

describe('isBackendVideoMediaUrl', () => {
  it('detects videos in object keys and signed URLs', () => {
    expect(isBackendVideoMediaUrl('moments/event/raw/clip.MOV')).toBe(true)
    expect(isBackendVideoMediaUrl('https://cdn.example.com/moments/event/clip.mp4?X-Amz-Signature=fake')).toBe(true)
    expect(isBackendVideoMediaUrl('https://cdn.example.com/moments/event/clip.m4v#poster')).toBe(true)
    expect(isBackendVideoMediaUrl('https://cdn.example.com/moments/event/clip.3gp?X-Amz-Signature=fake')).toBe(true)
    expect(isBackendVideoMediaUrl('https://cdn.example.com/moments/event/clip.avi?X-Amz-Signature=fake')).toBe(true)
    expect(isBackendVideoMediaUrl('moments/event/raw/clip.mkv')).toBe(true)
  })

  it('rejects image media paths', () => {
    expect(isBackendVideoMediaUrl('moments/event/photo.webp')).toBe(false)
    expect(isBackendVideoMediaUrl('https://cdn.example.com/photo.jpg?token=abc')).toBe(false)
  })
})

describe('isBackendVideoMedia', () => {
  it('prefers backend content_type when present', () => {
    expect(isBackendVideoMedia('moments/event/media-without-extension', 'video/mp4')).toBe(true)
    expect(isBackendVideoMedia('moments/event/photo.jpg', 'video/quicktime')).toBe(true)
  })

  it('falls back to media extension when content_type is absent', () => {
    expect(isBackendVideoMedia('moments/event/clip.webm')).toBe(true)
    expect(isBackendVideoMedia('moments/event/photo.webp')).toBe(false)
  })
})

describe('isRawMomentMediaPath', () => {
  it('detects raw moment object keys in relative and signed URLs', () => {
    expect(isRawMomentMediaPath('moments/event/raw/photo.jpg')).toBe(true)
    expect(isRawMomentMediaPath('https://cdn.example.com/moments/event/raw/photo.jpg?sig=fake')).toBe(true)
  })

  it('does not flag optimized moment object keys', () => {
    expect(isRawMomentMediaPath('moments/event/optimized/photo.webp')).toBe(false)
  })
})
