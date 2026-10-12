const cognitoMocks = vi.hoisted(() => ({ send: vi.fn() }))
const applicationAccessMocks = vi.hoisted(() => ({
  verifyApplicationAccess: vi.fn(),
}))

vi.mock('@/lib/cognito-direct', () => ({
  getCognitoClient: () => ({ send: cognitoMocks.send }),
  authRequestIsSameOrigin: vi.fn().mockReturnValue(true),
}))
vi.mock('@/lib/application-access', () => ({
  verifyApplicationAccess: applicationAccessMocks.verifyApplicationAccess,
}))

import { GET, POST, dynamic, revalidate } from '@/app/api/auth/token/route'
import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { authRequestIsSameOrigin } from '@/lib/cognito-direct'
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
    applicationAccessMocks.verifyApplicationAccess.mockReset()
    applicationAccessMocks.verifyApplicationAccess.mockResolvedValue({ ok: true, session: expectedSession })
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

  it('recovers a locally rejected cached session through the refresh cookie', async () => {
    const existingToken = unexpiredToken()
    applicationAccessMocks.verifyApplicationAccess
      .mockResolvedValueOnce({ ok: false, status: 503, error: 'Local API rejected the cached token' })
      .mockResolvedValueOnce({ ok: true, session: expectedSession })
    cognitoMocks.send.mockResolvedValue({ AuthenticationResult: { IdToken: 'refreshed-id-token', ExpiresIn: 900 } })

    const response = await POST(request({
      [AUTH_COOKIE_NAMES.session]: existingToken,
      [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret',
    }))

    expect(cognitoMocks.send).toHaveBeenCalledTimes(1)
    expect(applicationAccessMocks.verifyApplicationAccess).toHaveBeenNthCalledWith(1, expect.anything(), existingToken)
    expect(applicationAccessMocks.verifyApplicationAccess).toHaveBeenNthCalledWith(2, expect.anything(), 'refreshed-id-token')
    expect(await response.json()).toEqual({ token: 'refreshed-id-token', session: expectedSession })
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
  it('answers the same-origin guard with invalid_origin and keeps the cookies', async () => {
    vi.mocked(authRequestIsSameOrigin).mockReturnValueOnce(false)
    const response = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }, true))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'invalid_origin' })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)).toBeUndefined()
    expect(response.cookies.get(AUTH_COOKIE_NAMES.refreshToken)).toBeUndefined()
    expect(cognitoMocks.send).not.toHaveBeenCalled()
  })

  it('tags a backend access denial on the cached session as access_revoked and clears the cookies', async () => {
    applicationAccessMocks.verifyApplicationAccess.mockResolvedValueOnce({ ok: false, status: 403, error: 'Sin acceso' })
    const response = await POST(request({
      [AUTH_COOKIE_NAMES.session]: unexpiredToken(),
      [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret',
    }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Sin acceso', code: 'access_revoked' })
    expect(response.cookies.get(AUTH_COOKIE_NAMES.session)?.value).toBe('')
    expect(response.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value).toBe('')
  })

  it('tags a backend access denial after refresh as access_revoked, but not a 503', async () => {
    cognitoMocks.send.mockResolvedValue({ AuthenticationResult: { IdToken: 'new-id-token', ExpiresIn: 900 } })
    applicationAccessMocks.verifyApplicationAccess.mockResolvedValueOnce({ ok: false, status: 403, error: 'Sin acceso' })
    const denied = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }, true))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ code: 'access_revoked' })
    expect(denied.cookies.get(AUTH_COOKIE_NAMES.session)?.value).toBe('')

    applicationAccessMocks.verifyApplicationAccess.mockResolvedValueOnce({ ok: false, status: 503, error: 'Intenta nuevamente' })
    const unavailable = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }, true))
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).not.toHaveProperty('code')
  })
})
