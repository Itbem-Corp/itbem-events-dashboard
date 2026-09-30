import { proxy } from '@/proxy'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

function request(url: string, warmup = true) {
  return new NextRequest(url, {
    headers: warmup ? { 'x-eventi-local-warmup': 'route-shell' } : undefined,
  })
}

describe('development route warmup proxy boundary', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows the local startup script to compile a protected page shell in development', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = proxy(request('http://127.0.0.1:3000/events'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not honor the warmup header outside localhost', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = proxy(request('https://dashboard.example.com/events'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://dashboard.example.com/login')
  })

  it('preserves the externally selected tenant when the internal URL is localhost', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = proxy(new NextRequest('http://localhost:3017/events', {
      headers: {
        host: 'localhost:3017',
        'x-forwarded-host': 'dashboard.itbem.localhost:3017, localhost:3017',
        'x-forwarded-proto': 'http',
      },
    }))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://dashboard.itbem.localhost:3017/login')
  })

  it('does not honor the warmup header in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = proxy(request('http://127.0.0.1:3000/events'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  })

  it.each(['evil.example:3017', 'dashboard.localhost.evil.example:3017', 'localhost:3017@evil.example', 'https://dashboard.itbem.localhost:3017', 'dashboard_localhost:3017', 'unregistered.localhost:3017'])('ignores a non-local, unregistered or malformed forwarded host (%s)', (forwardedHost) => {
    const response = proxy(new NextRequest('http://localhost:3017/events', {
      headers: { 'x-forwarded-host': forwardedHost, 'x-forwarded-proto': 'https' },
    }))
    expect(response.headers.get('location')).toBe('http://localhost:3017/login')
  })

  it.each(['dashboard.eventiapp.localhost', 'dashboard.itbem.localhost', 'dashboard.cafettonhouse.localhost'])('preserves every catalog-approved local tenant (%s)', (hostname) => {
    const response = proxy(new NextRequest('http://localhost:3017/events', {
      headers: { 'x-forwarded-host': `${hostname}:3017`, 'x-forwarded-proto': 'http' },
    }))
    expect(response.headers.get('location')).toBe(`http://${hostname}:3017/login`)
  })

  it('never overrides a production tenant with a local forwarded host', () => {
    const response = proxy(new NextRequest('https://dashboard.itbem.com.mx/events', {
      headers: { 'x-forwarded-host': 'dashboard.eventiapp.localhost:3017', 'x-forwarded-proto': 'http' },
    }))
    expect(response.headers.get('location')).toBe('https://dashboard.itbem.com.mx/login')
  })
})

describe('public authentication routes', () => {
  it.each(['/login', '/forgot-password', '/register'])('allows %s without an existing session', (pathname) => {
    const response = proxy(request(`https://dashboard.eventiapp.com.mx${pathname}`, false))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('keeps login reachable when a browser has a stale session cookie', () => {
    const staleSessionRequest = request('https://dashboard.itbem.com.mx/login', false)
    staleSessionRequest.cookies.set('session', 'stale-or-other-product-token')

    const response = proxy(staleSessionRequest)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
