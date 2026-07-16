import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS, authCookieOptions, sessionMaxAge } from '@/lib/auth-session'
import { getCognitoClient } from '@/lib/cognito-direct'
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

export async function GET(request: NextRequest) {
  const session = request.cookies.get(AUTH_COOKIE_NAMES.session)?.value
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1'
  if (session && !forceRefresh) return privateJson({ token: session })
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
    const response = privateJson({ token: idToken })
    response.cookies.set(AUTH_COOKIE_NAMES.session, idToken, {
      ...authCookieOptions(), maxAge: sessionMaxAge(result.AuthenticationResult?.ExpiresIn),
    })
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    if (name === 'NotAuthorizedException') return clearSession(privateJson({ error: 'Session expired' }, 401))
    return privateJson({ error: 'Auth unavailable' }, 503)
  }
}
