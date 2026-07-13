import { describe, expect, it, vi } from 'vitest'
import { BlobUrlLruCache } from '@/lib/blob-url-lru-cache'

describe('BlobUrlLruCache', () => {
  it('reuses cached blob URLs and refreshes their recency', () => {
    const revoke = vi.fn()
    const cache = new BlobUrlLruCache(2, revoke)
    cache.set('video-a', 'blob:a')
    cache.set('video-b', 'blob:b')

    expect(cache.get('video-a')).toBe('blob:a')
    cache.set('video-c', 'blob:c')

    expect(cache.get('video-a')).toBe('blob:a')
    expect(cache.get('video-b')).toBeUndefined()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:b')
  })

  it('revokes replaced and cleared URLs', () => {
    const revoke = vi.fn()
    const cache = new BlobUrlLruCache(2, revoke)
    cache.set('video-a', 'blob:a1')
    cache.set('video-a', 'blob:a2')
    cache.set('video-b', 'blob:b')
    cache.clear()

    expect(revoke.mock.calls).toEqual([['blob:a1'], ['blob:a2'], ['blob:b']])
  })

  it('does not retain entries when configured with no capacity', () => {
    const revoke = vi.fn()
    const cache = new BlobUrlLruCache(0, revoke)
    cache.set('video-a', 'blob:a')

    expect(cache.get('video-a')).toBeUndefined()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a')
  })
})
