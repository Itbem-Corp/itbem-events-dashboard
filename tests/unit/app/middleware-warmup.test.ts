import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

function request(url: string, warmup = true) {
  return new NextRequest(url, {
    headers: warmup ? { 'x-eventi-local-warmup': 'route-shell' } : undefined,
  })
}

describe('development route warmup boundary', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows the local startup script to compile a protected page shell in development', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = middleware(request('http://127.0.0.1:3000/events'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not honor the warmup header outside localhost', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = middleware(request('https://dashboard.example.com/events'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://dashboard.example.com/login')
  })

  it('does not honor the warmup header in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = middleware(request('http://127.0.0.1:3000/events'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  })
})

describe('public authentication routes', () => {
  it.each(['/login', '/forgot-password', '/register'])('allows %s without an existing session', (pathname) => {
    const response = middleware(request(`https://dashboard.eventiapp.com.mx${pathname}`, false))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
