const cognitoMocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/cognito-direct', () => ({
  getCognitoClient: () => ({ send: cognitoMocks.send }),
  authRequestIsSameOrigin: vi.fn().mockReturnValue(true),
}))
vi.mock('@/lib/application-access', () => ({
  verifyApplicationAccess: vi.fn().mockResolvedValue({
    ok: true,
    session: { application: { code: 'eventiapp' }, user: { id: 'user-1' }, organizations: [], capabilities: [] },
  }),
}))

import { GET, POST, dynamic, revalidate } from '@/app/api/auth/token/route'
import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function request(values: Partial<Record<string, string>>, refresh = false) {
  const result = new NextRequest(`https://dashboard.eventiapp.com.mx/api/auth/token${refresh ? '?refresh=1' : ''}`, {
    headers: { origin: 'https://dashboard.eventiapp.com.mx' },
  })
  for (const [name, value] of Object.entries(values)) if (value) result.cookies.set(name, value)
  return result
}

function unexpiredToken() {
  return `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url')}.signature`
}

const expectedSession = { application: { code: 'eventiapp' }, user: { id: 'user-1' }, organizations: [], capabilities: [] }

describe('/api/auth/token', () => {
  beforeEach(() => {
    cognitoMocks.send.mockReset()
    vi.stubEnv('COGNITO_EVENTIAPP_CLIENT_ID', 'dashboard-client')
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('is always dynamic, private, no-store, and cookie-varying', async () => {
    const existingToken = unexpiredToken()
    const response = await GET(request({ [AUTH_COOKIE_NAMES.session]: existingToken }))
    expect(dynamic).toBe('force-dynamic')
    expect(revalidate).toBe(0)
    expect(await response.json()).toEqual({ token: existingToken })
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('refreshes the ID token without exposing the refresh token', async () => {
    cognitoMocks.send.mockResolvedValue({ AuthenticationResult: { IdToken: 'new-id-token', ExpiresIn: 900 } })
    const response = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }, true))
    const command = cognitoMocks.send.mock.calls[0]![0]
    expect(command.input.AuthParameters.REFRESH_TOKEN).toBe('refresh-secret')
    expect(await response.json()).toEqual({ token: 'new-id-token', session: expectedSession })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)).toMatchObject({ value: 'new-id-token', maxAge: 900, httpOnly: true, secure: true })
  })

  it('never consumes a refresh token from a GET request', async () => {
    const response = await GET(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }, true))
    expect(response.status).toBe(401)
    expect(cognitoMocks.send).not.toHaveBeenCalled()
  })

  it('clears stale auth cookies when Cognito rejects refresh', async () => {
    cognitoMocks.send.mockRejectedValue(Object.assign(new Error('expired'), { name: 'NotAuthorizedException' }))
    const response = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'expired' }, true))
    expect(response.status).toBe(401)
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)?.value).toBe('')
    expect(response.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value).toBe('')
  })
})
