import { describe, it, expect } from 'vitest'

// Isolated copy of the isVideo helper for unit testing
function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(url)
}

describe('isVideo helper', () => {
  it('detects mp4', () => expect(isVideo('https://s3.example.com/video.mp4')).toBe(true))
  it('detects mov', () => expect(isVideo('https://s3.example.com/clip.mov')).toBe(true))
  it('detects webm', () => expect(isVideo('video.webm?t=123')).toBe(true))
  it('does not flag jpg', () => expect(isVideo('photo.jpg')).toBe(false))
  it('does not flag png', () => expect(isVideo('photo.png')).toBe(false))
})
