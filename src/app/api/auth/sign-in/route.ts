import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import {
  AUTH_CHALLENGE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAMES,
  PRIVATE_NO_STORE_HEADERS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  authCookieOptions,
  sessionMaxAge,
} from '@/lib/auth-session'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
}

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) return privateJson({ error: 'Solicitud no válida.' }, 403)

  let body: { email?: unknown; password?: unknown }
  try { body = await request.json() } catch { return privateJson({ error: 'Solicitud no válida.' }, 400) }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password || email.length > 254 || password.length > 256) {
    return privateJson({ error: 'Ingresa un correo y contraseña válidos.' }, 400)
  }

  try {
    const tenant = tenantForRequest(request)
    const result = await getCognitoClient().send(new InitiateAuthCommand({
      ClientId: tenant.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }))

    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED' && result.Session) {
      const response = privateJson({ challenge: 'NEW_PASSWORD_REQUIRED' })
      const options = { ...authCookieOptions(), sameSite: 'strict' as const, maxAge: AUTH_CHALLENGE_MAX_AGE_SECONDS }
      response.cookies.set(AUTH_COOKIE_NAMES.challengeSession, result.Session, options)
      response.cookies.set(AUTH_COOKIE_NAMES.challengeUsername, email, options)
      return response
    }

    const auth = result.AuthenticationResult
    if (!auth?.IdToken) return privateJson({ error: 'Cognito requiere un paso de acceso no soportado.' }, 409)
    const response = privateJson({ ok: true, tenant: tenant.code })
    response.cookies.set(AUTH_COOKIE_NAMES.session, auth.IdToken, {
      ...authCookieOptions(), maxAge: sessionMaxAge(auth.ExpiresIn),
    })
    if (auth.RefreshToken) response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, auth.RefreshToken, {
      ...authCookieOptions(), maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
      return privateJson({ error: 'Correo o contraseña incorrectos.' }, 401)
    }
    if (name === 'UserNotConfirmedException') return privateJson({ error: 'Confirma tu correo antes de entrar.' }, 409)
    if (name === 'TooManyRequestsException' || name === 'LimitExceededException') {
      return privateJson({ error: 'Demasiados intentos. Espera un momento y vuelve a intentar.' }, 429)
    }
    console.error('Cognito direct sign-in failed', { reason: name })
    return privateJson({ error: 'El acceso no está disponible temporalmente.' }, 503)
  }
}

