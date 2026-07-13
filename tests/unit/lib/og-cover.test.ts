import {
  buildOgCoverAllowedHosts,
  fetchOgCover,
  isAllowedOgCoverUrl,
} from '@/lib/og-cover'
import { describe, expect, it, vi } from 'vitest'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const cdnUrl = 'https://cdn.eventiapp.com.mx/events/cover.png'

describe('OG cover allowlist', () => {
  it('matches exact HTTPS hosts only', () => {
    const hosts = new Set(['cdn.eventiapp.com.mx'])

    expect(isAllowedOgCoverUrl(cdnUrl, hosts)).toBe(true)
    expect(isAllowedOgCoverUrl('http://cdn.eventiapp.com.mx/cover.png', hosts)).toBe(false)
    expect(isAllowedOgCoverUrl('https://cdn.eventiapp.com.mx.attacker.test/cover.png', hosts)).toBe(false)
    expect(isAllowedOgCoverUrl('https://user@cdn.eventiapp.com.mx/cover.png', hosts)).toBe(false)
    expect(isAllowedOgCoverUrl('https://169.254.169.254/latest/meta-data', hosts)).toBe(false)
  })

  it('adds only exact valid configured hosts and the HTTPS backend host', () => {
    const hosts = buildOgCoverAllowedHosts(
      'https://api.eventiapp.com.mx/api',
      'images.example.com, https://media.example.com, https://bad.example.com/path'
    )

    expect(hosts.has('api.eventiapp.com.mx')).toBe(true)
    expect(hosts.has('images.example.com')).toBe(true)
    expect(hosts.has('media.example.com')).toBe(true)
    expect(hosts.has('bad.example.com')).toBe(false)
  })
})

describe('fetchOgCover', () => {
  it('returns only a bounded image with matching magic bytes', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(png, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.byteLength) },
      })
    )

    const result = await fetchOgCover(cdnUrl, {
      allowedHosts: new Set(['cdn.eventiapp.com.mx']),
      fetchImpl,
    })

    expect(result?.contentType).toBe('image/png')
    expect(new Uint8Array(result!.bytes)).toEqual(png)
    expect(fetchImpl).toHaveBeenCalledWith(
      cdnUrl,
      expect.objectContaining({ redirect: 'manual', cache: 'no-store', credentials: 'omit' })
    )
  })

  it('rejects redirects, non-images, and oversized bodies', async () => {
    const allowedHosts = new Set(['cdn.eventiapp.com.mx'])
    const redirect = await fetchOgCover(cdnUrl, {
      allowedHosts,
      fetchImpl: async () => new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } }),
    })
    const html = await fetchOgCover(cdnUrl, {
      allowedHosts,
      fetchImpl: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    })
    const oversized = await fetchOgCover(cdnUrl, {
      allowedHosts,
      maxBytes: 4,
      fetchImpl: async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    })

    expect(redirect).toBeNull()
    expect(html).toBeNull()
    expect(oversized).toBeNull()
  })

  it('aborts a stalled cover fetch at the configured timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )

    await expect(
      fetchOgCover(cdnUrl, {
        allowedHosts: new Set(['cdn.eventiapp.com.mx']),
        fetchImpl,
        timeoutMs: 10,
      })
    ).resolves.toBeNull()
  })
})
