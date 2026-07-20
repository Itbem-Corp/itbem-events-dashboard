import { contentSecurityPolicyForHostname } from '@/lib/content-security-policy'
import { describe, expect, it } from 'vitest'

describe('dashboard CSP tenant boundaries', () => {
  it('allows only the API assigned to the requested product hostname', () => {
    const itbem = contentSecurityPolicyForHostname('dashboard.itbem.com.mx', { NODE_ENV: 'production' })

    expect(itbem).toContain("connect-src 'self' https://api.itbem.com.mx")
    expect(itbem).not.toContain('https://api.eventiapp.com.mx')
    expect(itbem).not.toContain('https://api.cafettonhouse.com')
  })

  it('keeps branded local development on the local API', () => {
    const local = contentSecurityPolicyForHostname('dashboard.cafettonhouse.localhost', {
      NODE_ENV: 'development',
      NEXT_PUBLIC_BACKEND_URL: 'http://localhost:8080/api',
    })

    expect(local).toContain("connect-src 'self' http://localhost:8080")
  })

  it('uses a nonce instead of allowing arbitrary inline production scripts', () => {
	const policy = contentSecurityPolicyForHostname(
	  'dashboard.eventiapp.com.mx',
	  { NODE_ENV: 'production' },
	  'requestnonce123',
	)

	expect(policy).toContain("script-src 'self' 'nonce-requestnonce123' 'strict-dynamic'")
	expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
  })
})
