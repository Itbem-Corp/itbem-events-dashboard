export const AUTH_COOKIE_NAMES = {
  session: 'session',
  refreshToken: 'refresh_token',
  oauthState: 'oauth_state',
  pkceVerifier: 'pkce_verifier',
  challengeSession: 'auth_challenge_session',
  challengeUsername: 'auth_challenge_username',
} as const

export const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 10 * 60
export const AUTH_CHALLENGE_MAX_AGE_SECONDS = 10 * 60
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60

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

export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
} as const
