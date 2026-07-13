import { AUTH_COOKIE_NAMES } from '@/lib/auth-session'
import { GET, dynamic, revalidate } from '@/app/(auth)/login/route'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cognitoEnv = {
  COGNITO_CLIENT_ID: 'dashboard-client',
  COGNITO_DOMAIN: 'https://auth.example.com',
  COGNITO_REDIRECT_URI: 'https://dashboard.eventiapp.com.mx/auth/callback',
}

describe('login route', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is dynamic and starts a state-bound S256 PKCE transaction', async () => {
    for (const [key, value] of Object.entries(cognitoEnv)) vi.stubEnv(key, value)

    const response = await GET()
    const location = new URL(response.headers.get('location')!)

    expect(dynamic).toBe('force-dynamic')
    expect(revalidate).toBe(0)
    expect(response.status).toBe(307)
    expect(location.origin).toBe('https://auth.example.com')
    expect(location.pathname).toBe('/oauth2/authorize')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(response.cookies.get(AUTH_COOKIE_NAMES.oauthState)?.value).toBe(
      location.searchParams.get('state')
    )
    expect(response.cookies.get(AUTH_COOKIE_NAMES.pkceVerifier)?.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('fails closed when Cognito configuration is missing', async () => {
    vi.stubEnv('COGNITO_CLIENT_ID', '')
    vi.stubEnv('COGNITO_DOMAIN', '')
    vi.stubEnv('COGNITO_REDIRECT_URI', '')

    const response = await GET()

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
