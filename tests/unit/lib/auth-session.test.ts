import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  PRIVATE_NO_STORE_HEADERS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  authCookieOptions,
  refreshCookieOptions,
  sessionTokenNeedsRefresh,
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

  it('keeps refresh credentials same-site strict', () => {
    expect(refreshCookieOptions('production')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    })
    expect(REFRESH_TOKEN_MAX_AGE_SECONDS).toBe(5 * 24 * 60 * 60)
  })

  it('defines a private response policy that varies on cookies', () => {
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('private')
    expect(PRIVATE_NO_STORE_HEADERS['Cache-Control']).toContain('no-store')
    expect(PRIVATE_NO_STORE_HEADERS.Vary).toBe('Cookie')
  })

  it('refreshes close-to-expiry or malformed session tokens proactively', () => {
    const token = (exp: number) => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
    expect(sessionTokenNeedsRefresh(token(1_000), 920)).toBe(true)
    expect(sessionTokenNeedsRefresh(token(2_000), 920)).toBe(false)
    expect(sessionTokenNeedsRefresh('invalid', 920)).toBe(true)
  })
})
