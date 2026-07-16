import { authRequestIsSameOrigin } from '@/lib/cognito-direct'
import { describe, expect, it } from 'vitest'

function request(url: string, headers: Record<string, string>): Request {
  return {
    url,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Request
}

describe('authRequestIsSameOrigin', () => {
  it('accepts the public Vercel host forwarded to an internal request URL', () => {
    const authRequest = request('https://internal-deployment.vercel.app/api/auth/sign-in', {
        origin: 'https://dashboard.eventiapp.com.mx',
        host: 'internal-deployment.vercel.app',
        'x-forwarded-host': 'dashboard.eventiapp.com.mx',
    })
    expect(authRequestIsSameOrigin(authRequest)).toBe(true)
  })

  it('rejects a cross-site origin even if an unrelated host is forwarded', () => {
    const authRequest = request('https://dashboard.eventiapp.com.mx/api/auth/sign-in', {
      origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site',
    })
    expect(authRequestIsSameOrigin(authRequest)).toBe(false)
  })
})
