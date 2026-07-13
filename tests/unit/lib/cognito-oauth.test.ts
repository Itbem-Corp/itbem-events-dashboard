import { describe, expect, it } from 'vitest'

import {
  buildCognitoAuthorizeUrl,
  buildCognitoForgotPasswordUrl,
  buildCognitoRefreshRequestBody,
  buildCognitoTokenRequestBody,
  createOAuthTransaction,
  oauthValuesMatch,
} from '@/lib/cognito-oauth'

const env = {
  COGNITO_CLIENT_ID: 'local-client',
  COGNITO_DOMAIN: 'https://auth.example.com',
  COGNITO_REDIRECT_URI: 'http://localhost:3000/auth/callback',
}

describe('Cognito OAuth helpers', () => {
  it('omits client_secret for a public app client', () => {
    const body = buildCognitoTokenRequestBody('authorization-code', env)

    expect(body.get('client_id')).toBe('local-client')
    expect(body.get('code')).toBe('authorization-code')
    expect(body.has('client_secret')).toBe(false)
  })

  it('includes client_secret only when a confidential client configures one', () => {
    const body = buildCognitoTokenRequestBody('authorization-code', {
      ...env,
      COGNITO_CLIENT_SECRET: 'client-secret',
    })

    expect(body.get('client_secret')).toBe('client-secret')
  })

  it('binds the authorization code exchange to the PKCE verifier', () => {
    const body = buildCognitoTokenRequestBody('authorization-code', env, 'pkce-verifier')

    expect(body.get('code_verifier')).toBe('pkce-verifier')
  })

  it('builds an authorization URL with state and S256 PKCE', () => {
    const url = new URL(buildCognitoAuthorizeUrl('oauth-state', 'pkce-challenge', env))

    expect(url.origin).toBe('https://auth.example.com')
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(url.searchParams.get('state')).toBe('oauth-state')
    expect(url.searchParams.get('code_challenge')).toBe('pkce-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('creates high-entropy base64url OAuth state and PKCE values', async () => {
    const transaction = await createOAuthTransaction()

    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(transaction.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(transaction.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(transaction.challenge).not.toBe(transaction.verifier)
  })

  it('compares OAuth state without accepting length or value mismatches', () => {
    expect(oauthValuesMatch('same-state', 'same-state')).toBe(true)
    expect(oauthValuesMatch('same-state', 'other-stat')).toBe(false)
    expect(oauthValuesMatch('same-state', 'same-state-longer')).toBe(false)
  })

  it('builds a refresh grant without exposing callback-only parameters', () => {
    const body = buildCognitoRefreshRequestBody('refresh-token', env)

    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('local-client')
    expect(body.get('refresh_token')).toBe('refresh-token')
    expect(body.has('redirect_uri')).toBe(false)
    expect(body.has('code')).toBe(false)
  })

  it('uses the configured server-side callback for password recovery', () => {
    const url = new URL(buildCognitoForgotPasswordUrl(env)!)

    expect(url.origin).toBe('https://auth.example.com')
    expect(url.pathname).toBe('/forgotPassword')
    expect(url.searchParams.get('client_id')).toBe('local-client')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback')
  })

  it('does not redirect when the server-side Cognito config is incomplete', () => {
    expect(buildCognitoForgotPasswordUrl({ ...env, COGNITO_DOMAIN: '' })).toBeNull()
  })

  it('rejects a non-HTTPS Cognito origin', () => {
    expect(() => buildCognitoAuthorizeUrl('state', 'challenge', { ...env, COGNITO_DOMAIN: 'http://auth.example.com' })).toThrow(
      'HTTPS origin'
    )
  })
})
