import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS, REFRESH_TOKEN_MAX_AGE_SECONDS, authCookieOptions, refreshCookieOptions, sessionMaxAge, sessionTokenNeedsRefresh } from '@/lib/auth-session'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { verifyApplicationAccess } from '@/lib/application-access'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
}
function clearSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.session, '', { path: '/', maxAge: 0 })
  response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, '', { path: '/', maxAge: 0 })
  return response
}

async function issueToken(request: NextRequest) {
  const session = request.cookies.get(AUTH_COOKIE_NAMES.session)?.value
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1'
  if (session && !forceRefresh && !sessionTokenNeedsRefresh(session)) {
    const access = await verifyApplicationAccess(request, session)
    if (!access.ok) return clearSession(privateJson({ error: access.error }, access.status))
    return privateJson({ token: session, session: access.session })
  }
  if (!refreshToken) return clearSession(privateJson({ error: 'No session' }, 401))

  try {
    const tenant = tenantForRequest(request)
    const result = await getCognitoClient().send(new InitiateAuthCommand({
      ClientId: tenant.clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }))
    const idToken = result.AuthenticationResult?.IdToken
    if (!idToken) return clearSession(privateJson({ error: 'Session expired' }, 401))
    const access = await verifyApplicationAccess(request, idToken)
    if (!access.ok) return clearSession(privateJson({ error: access.error }, access.status))
    const response = privateJson({ token: idToken, session: access.session })
    response.cookies.set(AUTH_COOKIE_NAMES.session, idToken, {
      ...authCookieOptions(), maxAge: sessionMaxAge(result.AuthenticationResult?.ExpiresIn),
    })
    if (result.AuthenticationResult?.RefreshToken) {
      response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, result.AuthenticationResult.RefreshToken, {
        ...refreshCookieOptions(), maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      })
    }
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    if (name === 'NotAuthorizedException') return clearSession(privateJson({ error: 'Session expired' }, 401))
    return privateJson({ error: 'Auth unavailable' }, 503)
  }
}

// Compatibility reads are safe only while the ID token is still usable. A
// refresh token is never consumed by GET, so a cross-site navigation cannot
// mutate an authenticated session.
export async function GET(request: NextRequest) {
  const session = request.cookies.get(AUTH_COOKIE_NAMES.session)?.value
  if (session && !sessionTokenNeedsRefresh(session)) return privateJson({ token: session })
  return privateJson({ error: 'Refresh requires POST' }, 401)
}

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) return privateJson({ error: 'Solicitud no válida.' }, 403)
  return issueToken(request)
}
