const cognitoMocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/cognito-direct', () => ({
  authRequestIsSameOrigin: vi.fn().mockReturnValue(true),
  getCognitoClient: () => ({ send: cognitoMocks.send }),
}))
vi.mock('@/lib/tenant-config', () => ({
  tenantForRequest: () => ({ clientId: 'eventiapp-client' }),
}))

import { GET, POST } from '@/app/(auth)/logout/route'
import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function request(values: Partial<Record<string, string>> = {}) {
  const result = new NextRequest('https://dashboard.eventiapp.com.mx/logout', {
    method: 'POST',
    headers: { origin: 'https://dashboard.eventiapp.com.mx' },
  })
  for (const [name, value] of Object.entries(values)) if (value) result.cookies.set(name, value)
  return result
}

describe('/logout', () => {
  beforeEach(() => cognitoMocks.send.mockReset())

  it('revokes the HttpOnly refresh credential and clears all auth cookies through POST', async () => {
    const response = await POST(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }))
    expect(cognitoMocks.send).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    for (const name of Object.values(AUTH_COOKIE_NAMES)) {
      expect(response.cookies.get(name)?.value).toBe('')
    }
  })

  it('does not let a GET request mutate an authenticated session', async () => {
    const response = await GET(request({ [AUTH_COOKIE_NAMES.refreshToken]: 'refresh-secret' }))
    expect(response.status).toBe(405)
    expect(cognitoMocks.send).not.toHaveBeenCalled()
  })
})
