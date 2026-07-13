import { GET } from '@/app/auth/callback/route'
import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = 'state-value'
const verifier = 'pkce-verifier-value'

function callbackRequest(query: string, cookieState = state) {
  const request = new NextRequest(`https://dashboard.eventiapp.com.mx/auth/callback?${query}`)
  request.cookies.set(AUTH_COOKIE_NAMES.oauthState, cookieState)
  request.cookies.set(AUTH_COOKIE_NAMES.pkceVerifier, verifier)
  return request
}

describe('Cognito callback route', () => {
  beforeEach(() => {
    vi.stubEnv('COGNITO_CLIENT_ID', 'dashboard-client')
    vi.stubEnv('COGNITO_DOMAIN', 'https://auth.example.com')
    vi.stubEnv('COGNITO_REDIRECT_URI', 'https://dashboard.eventiapp.com.mx/auth/callback')
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('rejects a callback whose state does not match and never exchanges its code', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(callbackRequest(`code=auth-code&state=wrong-state`))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe('invalid_state')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.cookies.get(AUTH_COOKIE_NAMES.oauthState)?.value).toBe('')
    expect(response.cookies.get(AUTH_COOKIE_NAMES.pkceVerifier)?.value).toBe('')
  })

  it('validates state even when Cognito returns an OAuth error', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(callbackRequest('error=access_denied&state=wrong-state'))

    expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe('invalid_state')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exchanges a valid code with PKCE and aligns session expiry with Cognito', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      new Response(
        JSON.stringify({ id_token: 'fresh-id-token', refresh_token: 'fresh-refresh-token', expires_in: 1_800 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = callbackRequest(`code=auth-code&state=${state}`)
    expect(request.nextUrl.searchParams.get('state')).toBe(state)
    expect(request.cookies.get(AUTH_COOKIE_NAMES.oauthState)?.value).toBe(state)
    expect(request.cookies.get(AUTH_COOKIE_NAMES.pkceVerifier)?.value).toBe(verifier)

    const response = await GET(request)
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://dashboard.eventiapp.com.mx/')
    expect(requestBody.get('code_verifier')).toBe(verifier)
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)).toMatchObject({
      value: 'fresh-id-token',
      maxAge: 1_800,
      httpOnly: true,
      secure: true,
    })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.refreshToken)).toMatchObject({
      value: 'fresh-refresh-token',
      httpOnly: true,
      secure: true,
    })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.oauthState)?.value).toBe('')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
