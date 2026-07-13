import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  PRIVATE_NO_STORE_HEADERS,
  authCookieOptions,
  sessionMaxAge,
} from '@/lib/auth-session'
import { describe, expect, it } from 'vitest'

describe('auth session policy', () => {
  it('keeps ID-token cookies aligned with Cognito expiry', () => {
    expect(sessionMaxAge(1_800)).toBe(1_800)
    expect(sessionMaxAge(undefined)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS)
    expect(sessionMaxAge(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS)
    expect(sessionMaxAge(90_000)).toBe(86_400)
  })

  it('uses secure HttpOnly cookies in production', () => {
    expect(authCookieOptions('production')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('defines a private response policy that varies on cookies', () => {
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('private')
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('no-store')
    expect(PRIVATE_NO_STORE_HEADERS.Vary).toBe('Cookie')
  })
})
