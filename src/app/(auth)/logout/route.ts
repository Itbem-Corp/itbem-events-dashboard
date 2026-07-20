import { RevokeTokenCommand } from '@aws-sdk/client-cognito-identity-provider'
import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS } from '@/lib/auth-session'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

function clearAuthenticationCookies(response: NextResponse) {
  for (const name of Object.values(AUTH_COOKIE_NAMES)) response.cookies.set(name, '', { path: '/', maxAge: 0 })
  response.cookies.set('access_token', '', { path: '/', maxAge: 0 })
  return response
}

async function revokeRefreshToken(request: NextRequest) {
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value
  if (!refreshToken) return

  try {
    const tenant = tenantForRequest(request)
    await getCognitoClient().send(new RevokeTokenCommand({
      ClientId: tenant.clientId,
      Token: refreshToken,
    }))
  } catch (error) {
    // Local logout must still finish if Cognito is temporarily unavailable.
    console.warn('Cognito token revocation failed during logout', {
      reason: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS })
  }

  await revokeRefreshToken(request)
  return clearAuthenticationCookies(NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS }))
}

// A direct GET remains friendly for an unauthenticated user, but never mutates
// a live session. The application always uses the protected POST above.
export function GET(request: NextRequest) {
  const hasAuthentication = Object.values(AUTH_COOKIE_NAMES).some((name) => request.cookies.has(name))
  if (hasAuthentication) {
    return NextResponse.json({ error: 'Use POST para cerrar sesión.' }, { status: 405, headers: PRIVATE_NO_STORE_HEADERS })
  }
  return NextResponse.redirect(new URL('/login', request.url), { headers: PRIVATE_NO_STORE_HEADERS })
}
