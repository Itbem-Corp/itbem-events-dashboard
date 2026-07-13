import { describe, it, expect } from 'vitest'

import { isBackendVideoMediaUrl } from '@/lib/media-url'

describe('isVideo helper', () => {
  it('detects mp4', () => expect(isBackendVideoMediaUrl('https://s3.example.com/video.mp4')).toBe(true))
  it('detects mov', () => expect(isBackendVideoMediaUrl('https://s3.example.com/clip.mov')).toBe(true))
  it('detects webm', () => expect(isBackendVideoMediaUrl('video.webm?t=123')).toBe(true))
  it('detects 3gp', () => expect(isBackendVideoMediaUrl('video.3gp?t=123')).toBe(true))
  it('does not flag jpg', () => expect(isBackendVideoMediaUrl('photo.jpg')).toBe(false))
  it('does not flag png', () => expect(isBackendVideoMediaUrl('photo.png')).toBe(false))
})
