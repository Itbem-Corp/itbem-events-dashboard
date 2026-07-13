const cookieMocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieMocks.get })),
}))

import { GET, dynamic, revalidate } from '@/app/api/auth/token/route'
import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function request(refresh = false) {
  return new NextRequest(`https://dashboard.eventiapp.com.mx/api/auth/token${refresh ? '?refresh=1' : ''}`)
}

function cookies(values: Partial<Record<string, string>>) {
  cookieMocks.get.mockImplementation((name: string) => {
    const value = values[name]
    return value ? { name, value } : undefined
  })
}

describe('/api/auth/token', () => {
  beforeEach(() => {
    cookieMocks.get.mockReset()
    vi.stubEnv('COGNITO_CLIENT_ID', 'dashboard-client')
    vi.stubEnv('COGNITO_DOMAIN', 'https://auth.example.com')
    vi.stubEnv('COGNITO_REDIRECT_URI', 'https://dashboard.eventiapp.com.mx/auth/callback')
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('is always dynamic, private, no-store, and cookie-varying', async () => {
    cookies({ [AUTH_COOKIE_NAMES.session]: 'existing-token' })

    const response = await GET(request())

    expect(dynamic).toBe('force-dynamic')
    expect(revalidate).toBe(0)
    expect(await response.json()).toEqual({ token: 'existing-token' })
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('refreshes the ID token without exposing the refresh token', async () => {
    cookies({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' })
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ id_token: 'new-id-token', expires_in: 900 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(request(true))
    const body = fetchMock.mock.calls[0]![1].body as URLSearchParams

    expect(body.get('refresh_token')).toBe('refresh-secret')
    expect(await response.json()).toEqual({ token: 'new-id-token' })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)).toMatchObject({
      value: 'new-id-token',
      maxAge: 900,
      httpOnly: true,
      secure: true,
    })
  })

  it('clears stale auth cookies when Cognito rejects the refresh grant', async () => {
    cookies({ [AUTH_COOKIE_NAMES.refreshToken]: 'expired-refresh-token' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })))

    const response = await GET(request(true))

    expect(response.status).toBe(401)
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)?.value).toBe('')
    expect(response.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value).toBe('')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
