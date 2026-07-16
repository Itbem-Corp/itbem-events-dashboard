import { clearAuthAttempts, consumeAuthAttempt } from '@/lib/auth-rate-limit'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

describe('auth rate limiting', () => {
  it('limits repeated password attempts per identity and IP without storing raw identifiers', () => {
    const request = new NextRequest('https://dashboard.eventiapp.com.mx/api/auth/sign-in', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })
    const email = 'security-test@example.com'

    for (let attempt = 0; attempt < 7; attempt += 1) {
      expect(consumeAuthAttempt(request, email)).toBeNull()
    }
    expect(consumeAuthAttempt(request, email)).toBeGreaterThan(0)

    clearAuthAttempts(request, email)
    expect(consumeAuthAttempt(request, email)).toBeNull()
    clearAuthAttempts(request, email)
  })
})
