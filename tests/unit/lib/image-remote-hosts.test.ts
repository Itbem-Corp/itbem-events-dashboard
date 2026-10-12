// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  buildImageRemotePatterns,
  isOptimizableImageSrc,
  isRenderableImageSrc,
  originToRemotePattern,
} from '@/lib/image-remote-hosts.mjs'

describe('image remote hosts', () => {
  it('keeps the production patterns and the backend origin', () => {
    const patterns = buildImageRemotePatterns({ backendUrl: 'https://api.eventiapp.com.mx/api' })

    expect(patterns).toEqual([
      { protocol: 'https', hostname: 'api.eventiapp.com.mx' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.eventiapp.com.mx' },
    ])
  })

  it('adds extra hosts from the env list and ignores invalid entries', () => {
    const patterns = buildImageRemotePatterns({
      backendUrl: 'http://localhost:18080',
      extraHosts: ' http://host.docker.internal:4566 , not a url, ftp://x.test, https://*.media.test ',
    })

    expect(patterns[0]).toEqual({ protocol: 'http', hostname: 'localhost', port: '18080' })
    expect(patterns).toContainEqual({ protocol: 'http', hostname: 'host.docker.internal', port: '4566' })
    expect(patterns).toContainEqual({ protocol: 'https', hostname: '*.media.test' })
    expect(patterns).toHaveLength(6)
  })

  it('rejects origins with paths or unsupported protocols', () => {
    expect(originToRemotePattern('https://cdn.test/path')).toBeNull()
    expect(originToRemotePattern('javascript:alert(1)')).toBeNull()
    expect(originToRemotePattern('')).toBeNull()
  })

  it('rejects TLD-wide wildcards and wildcards over a single label or an IP', () => {
    expect(originToRemotePattern('https://**.com')).toBeNull()
    expect(originToRemotePattern('https://*.com')).toBeNull()
    expect(originToRemotePattern('http://*.localhost:3000')).toBeNull()
    expect(originToRemotePattern('http://**.10.0.0.1')).toBeNull()
    expect(originToRemotePattern('https://**.media.example.com')).toEqual({ protocol: 'https', hostname: '**.media.example.com' })
    expect(originToRemotePattern('https://*.example.com')).toEqual({ protocol: 'https', hostname: '*.example.com' })
    // Plain hosts keep working, single-label ones included.
    expect(originToRemotePattern('http://localhost:4566')).toEqual({ protocol: 'http', hostname: 'localhost', port: '4566' })

    const patterns = buildImageRemotePatterns({ backendUrl: 'http://localhost:18080', extraHosts: 'https://**.com,https://**.cdn.example.com' })
    expect(patterns).not.toContainEqual(expect.objectContaining({ hostname: '**.com' }))
    expect(patterns).toContainEqual({ protocol: 'https', hostname: '**.cdn.example.com' })
  })

  it('decides which URLs next/image may optimize', () => {
    const patterns = buildImageRemotePatterns({ backendUrl: 'http://localhost:18080' })

    expect(isOptimizableImageSrc('https://bucket.s3.us-east-2.amazonaws.com/a.webp', patterns)).toBe(true)
    expect(isOptimizableImageSrc('https://cdn.eventiapp.com.mx/a.webp', patterns)).toBe(true)
    expect(isOptimizableImageSrc('http://localhost:18080/storage/a.webp', patterns)).toBe(true)
    expect(isOptimizableImageSrc('/eventiapp-icon.svg', patterns)).toBe(true)
    // The local S3 emulator and any unexpected host must not reach the optimizer.
    expect(isOptimizableImageSrc('http://host.docker.internal:4566/bucket/a.png', patterns)).toBe(false)
    expect(isOptimizableImageSrc('http://bucket.s3.amazonaws.com/a.webp', patterns)).toBe(false)
    expect(isOptimizableImageSrc('https://amazonaws.com/a.webp', patterns)).toBe(false)
    expect(isOptimizableImageSrc('https://evil.test/a.webp', patterns)).toBe(false)
    expect(isOptimizableImageSrc('//evil.test/a.webp', patterns)).toBe(false)
    expect(isOptimizableImageSrc('blob:http://localhost/1', patterns)).toBe(false)
  })

  it('matches single-label wildcards only one level deep', () => {
    const patterns = [{ protocol: 'https', hostname: '*.media.test' }]
    expect(isOptimizableImageSrc('https://a.media.test/x.png', patterns)).toBe(true)
    expect(isOptimizableImageSrc('https://a.b.media.test/x.png', patterns)).toBe(false)
  })

  it('knows which sources can be rendered at all', () => {
    expect(isRenderableImageSrc('http://host.docker.internal:4566/a.png')).toBe(true)
    expect(isRenderableImageSrc('blob:http://localhost:3017/abc')).toBe(true)
    expect(isRenderableImageSrc('data:image/png;base64,AAAA')).toBe(true)
    expect(isRenderableImageSrc('events/evt/cover.webp')).toBe(false)
    expect(isRenderableImageSrc('javascript:alert(1)')).toBe(false)
    expect(isRenderableImageSrc('')).toBe(false)
  })
})
