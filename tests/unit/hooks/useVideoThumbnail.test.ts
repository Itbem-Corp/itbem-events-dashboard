import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'

describe('useVideoThumbnail', () => {
  it('returns null when videoUrl is null', () => {
    const { result } = renderHook(() => useVideoThumbnail(null))
    expect(result.current).toBeNull()
  })

  it('returns null initially when videoUrl is provided (async extraction)', () => {
    const { result } = renderHook(() => useVideoThumbnail('https://example.com/video.mp4'))
    expect(result.current).toBeNull()
  })
})
