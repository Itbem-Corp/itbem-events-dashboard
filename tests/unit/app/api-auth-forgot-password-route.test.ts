const cognitoMocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/cognito-direct', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cognito-direct')>('@/lib/cognito-direct')
  return {
    ...actual,
    authRequestIsSameOrigin: () => true,
    getCognitoClient: () => ({ send: cognitoMocks.send }),
  }
})

import { POST } from '@/app/api/auth/forgot-password/route'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function request(body: unknown) {
  return new NextRequest('https://dashboard.eventiapp.com.mx/api/auth/forgot-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: 'dashboard.eventiapp.com.mx',
      Origin: 'https://dashboard.eventiapp.com.mx',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify(body),
  })
}

describe('/api/auth/forgot-password', () => {
  beforeEach(() => {
    cognitoMocks.send.mockReset()
    vi.stubEnv('COGNITO_EVENTIAPP_CLIENT_ID', 'dashboard-client')
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('normalizes the account and starts recovery without exposing identity state', async () => {
    cognitoMocks.send.mockResolvedValue({})

    const response = await POST(request({ email: ' Owner@EventiApp.com ' }))
    const command = cognitoMocks.send.mock.calls[0]![0]

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(command.input.Username).toBe('owner@eventiapp.com')
    expect(await response.json()).toEqual({ ok: true, codeSent: true })
  })

  it('rejects malformed confirmation data before calling Cognito', async () => {
    const response = await POST(request({ email: 'owner@eventiapp.com', code: '1', password: 'short' }))

    expect(response.status).toBe(400)
    expect(cognitoMocks.send).not.toHaveBeenCalled()
  })

  it('keeps unknown accounts indistinguishable from valid recovery requests', async () => {
    cognitoMocks.send.mockRejectedValue(Object.assign(new Error('missing'), { name: 'UserNotFoundException' }))

    const response = await POST(request({ email: 'unknown@eventiapp.com' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, codeSent: true })
  })
})
