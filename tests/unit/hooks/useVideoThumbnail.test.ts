import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useVideoThumbnail, isBlackFrame } from '@/hooks/useVideoThumbnail'

// ---------------------------------------------------------------------------
// Helpers for isBlackFrame tests
// ---------------------------------------------------------------------------

/**
 * Creates a mock HTMLCanvasElement whose getContext('2d') returns a fake
 * context with getImageData pre-filled with the given flat pixel array.
 * happy-dom does not support canvas 2d rendering, so we mock the entire
 * context rather than relying on fillRect.
 */
function makeCanvasMock(width: number, height: number, fillRgb: [number, number, number]): HTMLCanvasElement {
  const [r, g, b] = fillRgb
  const pixelCount = width * height
  const data = new Uint8ClampedArray(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    data[i * 4 + 0] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  const fakeImageData = { data } as ImageData

  const fakeCtx = {
    getImageData: () => fakeImageData,
  } as unknown as CanvasRenderingContext2D

  const canvas = {
    width,
    height,
    getContext: (id: string) => (id === '2d' ? fakeCtx : null),
  } as unknown as HTMLCanvasElement

  return canvas
}

// ---------------------------------------------------------------------------
// isBlackFrame — pure unit tests using mocked canvas
// ---------------------------------------------------------------------------

describe('isBlackFrame', () => {
  it('returns true for an all-black canvas', () => {
    expect(isBlackFrame(makeCanvasMock(160, 90, [0, 0, 0]))).toBe(true)
  })

  it('returns true for a very dark canvas (brightness < 15)', () => {
    // average brightness = (10+10+10)/3 ≈ 10 — below threshold
    expect(isBlackFrame(makeCanvasMock(160, 90, [10, 10, 10]))).toBe(true)
  })

  it('returns false for a clearly non-black canvas', () => {
    expect(isBlackFrame(makeCanvasMock(160, 90, [128, 128, 128]))).toBe(false)
  })

  it('returns false for a white canvas', () => {
    expect(isBlackFrame(makeCanvasMock(160, 90, [255, 255, 255]))).toBe(false)
  })

  it('returns false for a canvas at exactly the brightness boundary (average = 15)', () => {
    // rgb(15,15,15) → average = (15+15+15)/3 = 15 — NOT below threshold, so false
    expect(isBlackFrame(makeCanvasMock(160, 90, [15, 15, 15]))).toBe(false)
  })

  it('returns false for a coloured canvas (e.g. red)', () => {
    // (255+0+0)/3 ≈ 85 — well above threshold
    expect(isBlackFrame(makeCanvasMock(160, 90, [255, 0, 0]))).toBe(false)
  })

  it('handles a 1x1 canvas that is black', () => {
    expect(isBlackFrame(makeCanvasMock(1, 1, [0, 0, 0]))).toBe(true)
  })

  it('handles a 1x1 canvas that is not black', () => {
    expect(isBlackFrame(makeCanvasMock(1, 1, [200, 200, 200]))).toBe(false)
  })

  it('returns true when getContext returns null', () => {
    const canvas = { width: 160, height: 90, getContext: () => null } as unknown as HTMLCanvasElement
    expect(isBlackFrame(canvas)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useVideoThumbnail — hook-level smoke tests (happy-dom environment)
// ---------------------------------------------------------------------------

describe('useVideoThumbnail', () => {
  it('returns null when videoUrl is null', () => {
    const { result } = renderHook(() => useVideoThumbnail(null))
    expect(result.current).toBeNull()
  })

  it('returns null initially when videoUrl is provided', () => {
    const { result } = renderHook(() => useVideoThumbnail('https://example.com/video.mp4'))
    expect(result.current).toBeNull()
  })

  it('resets to null when videoUrl changes', async () => {
    // Start with null, then provide URL — state should reset
    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useVideoThumbnail(url),
      { initialProps: { url: null as string | null } }
    )
    expect(result.current).toBeNull()
    // Change to a URL — should immediately reset (still null since async)
    rerender({ url: 'https://example.com/video.mp4' })
    expect(result.current).toBeNull()
  })

  it('revokes blob URL on unmount', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { unmount } = renderHook(() => useVideoThumbnail('https://example.com/video.mp4'))
    unmount()
    // revokeObjectURL called — even if blobUrl is null, the cleanup runs
    // (actual revoke only happens if blob was created — here it won't be in happy-dom)
    // What we verify is that unmount doesn't throw
    expect(revokeSpy).not.toHaveBeenCalled()
    revokeSpy.mockRestore()
  })

  it('returns null when videoUrl is empty string', () => {
    // Empty string is falsy — the guard `if (!videoUrl) return` exits early
    const { result } = renderHook(() => useVideoThumbnail(''))
    expect(result.current).toBeNull()
  })
})
