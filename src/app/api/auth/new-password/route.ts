import { RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider'
import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS, REFRESH_TOKEN_MAX_AGE_SECONDS, authCookieOptions, sessionMaxAge } from '@/lib/auth-session'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { verifyApplicationAccess } from '@/lib/application-access'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS })
  const session = request.cookies.get(AUTH_COOKIE_NAMES.challengeSession)?.value
  const username = request.cookies.get(AUTH_COOKIE_NAMES.challengeUsername)?.value
  const challengeName = request.cookies.get(AUTH_COOKIE_NAMES.challengeName)?.value
  const body = await request.json().catch(() => null) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  if (challengeName !== 'NEW_PASSWORD_REQUIRED' || !session || !username || password.length < 8 || password.length > 256) {
    return NextResponse.json({ error: 'La sesión de cambio expiró o la contraseña no es válida.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS })
  }
  try {
    const tenant = tenantForRequest(request)
    const result = await getCognitoClient().send(new RespondToAuthChallengeCommand({
      ClientId: tenant.clientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: session,
      ChallengeResponses: { USERNAME: username, NEW_PASSWORD: password },
    }))
    const auth = result.AuthenticationResult
    if (!auth?.IdToken) return NextResponse.json({ error: 'No se pudo completar el acceso.' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS })
    const access = await verifyApplicationAccess(request, auth.IdToken)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status, headers: PRIVATE_NO_STORE_HEADERS })
    }
    const response = NextResponse.json({ ok: true, session: access.session }, { headers: PRIVATE_NO_STORE_HEADERS })
    response.cookies.set(AUTH_COOKIE_NAMES.session, auth.IdToken, { ...authCookieOptions(), maxAge: sessionMaxAge(auth.ExpiresIn) })
    if (auth.RefreshToken) response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, auth.RefreshToken, { ...authCookieOptions(), maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS })
    response.cookies.set(AUTH_COOKIE_NAMES.challengeSession, '', { path: '/', maxAge: 0 })
    response.cookies.set(AUTH_COOKIE_NAMES.challengeUsername, '', { path: '/', maxAge: 0 })
    response.cookies.set(AUTH_COOKIE_NAMES.challengeName, '', { path: '/', maxAge: 0 })
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    return NextResponse.json({ error: name === 'InvalidPasswordException' ? 'La contraseña no cumple la política de seguridad.' : 'No se pudo completar el cambio de contraseña.' }, { status: name === 'InvalidPasswordException' ? 400 : 503, headers: PRIVATE_NO_STORE_HEADERS })
  }
}
