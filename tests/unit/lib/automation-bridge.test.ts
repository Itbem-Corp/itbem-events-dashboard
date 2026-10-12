// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { bridgeAllowed, bridgePathIsSafe, encodeBridgePathSegment, forwardedHeaders } from '@/lib/automation-bridge'
import { GET } from '@/app/automation-bridge/[...path]/route'

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers })
}

describe('encodeBridgePathSegment', () => {
  it('keeps the guest prefix separator literal', () => {
    expect(encodeBridgePathSegment('all:7f1c')).toBe('all:7f1c')
    expect(encodeBridgePathSegment('summary:7f1c')).toBe('summary:7f1c')
  })

  it('keeps sub-delims and @ literal but escapes what must be escaped', () => {
    expect(encodeBridgePathSegment("a!$&'()*+,;=@b")).toBe("a!$&'()*+,;=@b")
    expect(encodeBridgePathSegment('a/b')).toBe('a%2Fb')
    expect(encodeBridgePathSegment('a b?c#d%')).toBe('a%20b%3Fc%23d%25')
    expect(encodeBridgePathSegment('niño')).toBe('ni%C3%B1o')
  })
})

describe('bridgePathIsSafe', () => {
  it('accepts ordinary segments, including encoded separators inside an id', () => {
    expect(bridgePathIsSafe(['guests', 'all:abc'])).toBe(true)
    expect(bridgePathIsSafe(['files', 'a/b', 'v1.2', '...'])).toBe(true)
    expect(bridgePathIsSafe(['report', '50%'])).toBe(true)
  })

  it('refuses dot segments, decoded or still encoded', () => {
    expect(bridgePathIsSafe(['..', 'admin'])).toBe(false)
    expect(bridgePathIsSafe(['session', '.'])).toBe(false)
    expect(bridgePathIsSafe(['%2E%2E', 'admin'])).toBe(false)
    expect(bridgePathIsSafe(['%252e%252e'])).toBe(false)
    expect(bridgePathIsSafe(['..%2F..', 'admin'])).toBe(false)
    expect(bridgePathIsSafe(['..\\admin'])).toBe(false)
  })
})

describe('bridgeAllowed', () => {
  it('allows loopback and *.localhost hosts outside production', () => {
    for (const host of ['localhost:3017', 'dashboard.itbem.localhost:3017', '127.0.0.1:3017', '[::1]:3017']) {
      expect(bridgeAllowed(request('http://localhost/x', { host }), 'development')).toBe(true)
    }
  })

  it('denies every request in a production build', () => {
    expect(bridgeAllowed(request('http://localhost/x', { host: 'localhost:3017' }), 'production')).toBe(false)
  })

  it('denies non-local hosts and non-local forwarded hosts', () => {
    expect(bridgeAllowed(request('http://x/x', { host: 'dashboard.eventiapp.com' }), 'development')).toBe(false)
    expect(bridgeAllowed(request('http://x/x', { host: '192.168.1.5:3017' }), 'development')).toBe(false)
    expect(bridgeAllowed(request('http://x/x', { host: 'evil.localhost.example.com' }), 'development')).toBe(false)
    expect(
      bridgeAllowed(
        request('http://x/x', { host: 'localhost:3017', 'x-forwarded-host': 'dashboard.eventiapp.com' }),
        'development'
      )
    ).toBe(false)
  })
})

describe('forwardedHeaders', () => {
  it('never relays a client-supplied X-Forwarded-For and forwards only allow-listed headers', () => {
    const headers = forwardedHeaders(
      request('http://localhost/x', { 'x-forwarded-for': '10.0.0.7', authorization: 'Bearer t', cookie: 'session=x' })
    )
    expect(headers.get('x-forwarded-for')).toBe('127.0.0.1')
    expect(headers.get('authorization')).toBe('Bearer t')
    expect(headers.get('cookie')).toBeNull()
  })

  it('reports loopback when there is no forwarded address', () => {
    expect(forwardedHeaders(request('http://localhost/x')).get('x-forwarded-for')).toBe('127.0.0.1')
  })
})

describe('automation-bridge route', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('reaches the API with a literal colon in prefixed guest routes', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:18080')

    const response = await GET(
      request('http://dashboard.eventiapp.localhost:3017/automation-bridge/guests/all:abc?page=2', {
        host: 'dashboard.eventiapp.localhost:3017',
      }),
      { params: Promise.resolve({ path: ['guests', 'all:abc'] }) }
    )

    expect(response.status).toBe(200)
    const target = (fetchMock.mock.calls[0] as unknown as [URL])[0]
    expect(target.toString()).toBe('http://localhost:18080/api/guests/all:abc?page=2')
  })

  it('answers 404 without calling the API in a production build', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NODE_ENV', 'production')

    const response = await GET(request('http://localhost:3017/automation-bridge/session', { host: 'localhost:3017' }), {
      params: Promise.resolve({ path: ['session'] }),
    })

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('answers 400 without calling the API for a dot-dot path', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      request('http://localhost:3017/automation-bridge/x/%2E%2E/health', { host: 'localhost:3017' }),
      { params: Promise.resolve({ path: ['x', '..', 'health'] }) }
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
