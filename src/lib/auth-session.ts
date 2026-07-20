export const AUTH_COOKIE_NAMES = {
  session: 'session',
  refreshToken: 'refresh_token',
  oauthState: 'oauth_state',
  pkceVerifier: 'pkce_verifier',
  challengeSession: 'auth_challenge_session',
  challengeUsername: 'auth_challenge_username',
  challengeName: 'auth_challenge_name',
} as const

export const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 10 * 60
export const AUTH_CHALLENGE_MAX_AGE_SECONDS = 10 * 60
// Must stay aligned with CognitoTenantsStack.refreshTokenValidity. A browser
// cookie that outlives Cognito's credential only creates a confusing stale
// session; it never extends access.
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 5 * 24 * 60 * 60
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60
export const SESSION_REFRESH_SKEW_SECONDS = 90

export function authCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function sessionMaxAge(expiresIn: unknown): number {
  const seconds = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_SESSION_MAX_AGE_SECONDS

  // An ID token should never outlive the cookie that represents it. Cognito
  // normally returns 3600 seconds; the upper bound protects against a malformed
  // upstream response creating an effectively permanent authenticated shell.
  return Math.min(Math.max(Math.floor(seconds), 60), 24 * 60 * 60)
}

// The refresh credential never needs to travel on a cross-site navigation.
// Keep the short-lived ID-token cookie Lax for OAuth return compatibility.
export function refreshCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return { ...authCookieOptions(nodeEnv), sameSite: 'strict' as const }
}

// This only decides when to renew an HttpOnly cookie; it never authorizes a
// request. The backend remains responsible for validating the Cognito JWT.
export function sessionTokenNeedsRefresh(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { exp?: unknown }
    const expiration = Number(claims.exp)
    return !Number.isFinite(expiration) || expiration <= nowSeconds + SESSION_REFRESH_SKEW_SECONDS
  } catch {
    return true
  }
}

export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
} as const
