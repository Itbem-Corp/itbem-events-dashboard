// Stable codes returned by POST /api/auth/token next to the HTTP status.
// `access_revoked` is sent only when the backend denied this session's
// product access, and the BFF clears the session cookies in that same
// response. `invalid_origin` is the same-origin (CSRF) guard: the cookies are
// untouched, so the browser must not treat it as a revoked session.
export const AUTH_TOKEN_ERROR_CODES = {
  accessRevoked: 'access_revoked',
  invalidOrigin: 'invalid_origin',
} as const

export type AuthTokenErrorCode = (typeof AUTH_TOKEN_ERROR_CODES)[keyof typeof AUTH_TOKEN_ERROR_CODES]

type AuthFailure = { status?: unknown; code?: unknown; response?: { status?: unknown } }

/**
 * True only when a token/session request failed in a way that means the
 * session is over: 401 (no usable session) or a 403 the BFF tagged as
 * `access_revoked`. Any other 403 (for example the same-origin guard behind a
 * proxy that rewrites Origin) leaves the session in place.
 */
export function authFailureEndsSession(error: unknown): boolean {
  const candidate = error as AuthFailure | null | undefined
  const status = candidate?.status ?? candidate?.response?.status
  if (status === 401) return true
  return status === 403 && candidate?.code === AUTH_TOKEN_ERROR_CODES.accessRevoked
}

/** Reads the `code` of a failed /api/auth/token response, if any. */
export async function readAuthTokenErrorCode(response: { json?: () => Promise<unknown> }): Promise<string | undefined> {
  try {
    const body = (await response.json?.()) as { code?: unknown } | undefined
    return typeof body?.code === 'string' ? body.code : undefined
  } catch {
    return undefined
  }
}
