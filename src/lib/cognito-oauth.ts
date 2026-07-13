const REQUIRED_TOKEN_ENV_KEYS = ['COGNITO_CLIENT_ID', 'COGNITO_REDIRECT_URI'] as const

type CognitoEnvironment = Readonly<Record<string, string | undefined>>
type CognitoEnvironmentKey =
  | (typeof REQUIRED_TOKEN_ENV_KEYS)[number]
  | 'COGNITO_CLIENT_SECRET'
  | 'COGNITO_DOMAIN'

function value(env: CognitoEnvironment, key: CognitoEnvironmentKey): string {
  return env[key]?.trim() ?? ''
}

function requiredValue(env: CognitoEnvironment, key: (typeof REQUIRED_TOKEN_ENV_KEYS)[number]): string {
  const configuredValue = value(env, key)
  if (!configuredValue) throw new Error(`Missing required Cognito configuration: ${key}`)
  return configuredValue
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function cognitoDomain(env: CognitoEnvironment): URL {
  const configuredDomain = value(env, 'COGNITO_DOMAIN')
  if (!configuredDomain) throw new Error('Missing required Cognito configuration: COGNITO_DOMAIN')

  const domain = new URL(`${configuredDomain.replace(/\/+$/, '')}/`)
  if (domain.protocol !== 'https:' || domain.username || domain.password) {
    throw new Error('COGNITO_DOMAIN must be an HTTPS origin')
  }
  return domain
}

export function buildCognitoAuthorizeUrl(
  state: string,
  codeChallenge: string,
  env: CognitoEnvironment = process.env
): string {
  const url = new URL('/oauth2/authorize', cognitoDomain(env))
  url.searchParams.set('client_id', requiredValue(env, 'COGNITO_CLIENT_ID'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email phone')
  url.searchParams.set('redirect_uri', requiredValue(env, 'COGNITO_REDIRECT_URI'))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function cognitoTokenUrl(env: CognitoEnvironment = process.env): string {
  return new URL('/oauth2/token', cognitoDomain(env)).toString()
}

export async function createOAuthTransaction(): Promise<{
  state: string
  verifier: string
  challenge: string
}> {
  const stateBytes = crypto.getRandomValues(new Uint8Array(32))
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const state = base64UrlEncode(stateBytes)
  const verifier = base64UrlEncode(verifierBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  return {
    state,
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
  }
}

export function oauthValuesMatch(expected: string, actual: string): boolean {
  if (!expected || expected.length !== actual.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index)
  }
  return mismatch === 0
}

export function buildCognitoTokenRequestBody(
  code: string,
  env: CognitoEnvironment = process.env,
  codeVerifier?: string
): URLSearchParams {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: requiredValue(env, 'COGNITO_CLIENT_ID'),
    code,
    redirect_uri: requiredValue(env, 'COGNITO_REDIRECT_URI'),
  })

  const clientSecret = value(env, 'COGNITO_CLIENT_SECRET')
  if (clientSecret) params.set('client_secret', clientSecret)
  if (codeVerifier) params.set('code_verifier', codeVerifier)

  return params
}

export function buildCognitoRefreshRequestBody(
  refreshToken: string,
  env: CognitoEnvironment = process.env
): URLSearchParams {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: requiredValue(env, 'COGNITO_CLIENT_ID'),
    refresh_token: refreshToken,
  })

  const clientSecret = value(env, 'COGNITO_CLIENT_SECRET')
  if (clientSecret) params.set('client_secret', clientSecret)

  return params
}

export function buildCognitoForgotPasswordUrl(env: CognitoEnvironment = process.env): string | null {
  const clientId = value(env, 'COGNITO_CLIENT_ID')
  const redirectUri = value(env, 'COGNITO_REDIRECT_URI')
  if (!clientId || !redirectUri) return null

  try {
    const url = new URL('/forgotPassword', cognitoDomain(env))

    url.searchParams.set('client_id', clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', redirectUri)
    return url.toString()
  } catch {
    return null
  }
}
