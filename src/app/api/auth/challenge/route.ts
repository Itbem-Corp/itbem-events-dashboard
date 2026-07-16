import {
  ChallengeNameType,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  AUTH_COOKIE_NAMES,
  PRIVATE_NO_STORE_HEADERS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  authCookieOptions,
  sessionMaxAge,
} from '@/lib/auth-session'
import { verifyApplicationAccess } from '@/lib/application-access'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RESPONSE_KEYS: Partial<Record<ChallengeNameType, string>> = {
  SMS_MFA: 'SMS_MFA_CODE',
  SOFTWARE_TOKEN_MFA: 'SOFTWARE_TOKEN_MFA_CODE',
  SMS_OTP: 'SMS_OTP_CODE',
  EMAIL_OTP: 'EMAIL_OTP_CODE',
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
}

function clearChallenge(response: NextResponse) {
  for (const name of [
    AUTH_COOKIE_NAMES.challengeSession,
    AUTH_COOKIE_NAMES.challengeUsername,
    AUTH_COOKIE_NAMES.challengeName,
  ]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
  return response
}

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) return privateJson({ error: 'Solicitud no válida.' }, 403)

  const session = request.cookies.get(AUTH_COOKIE_NAMES.challengeSession)?.value
  const username = request.cookies.get(AUTH_COOKIE_NAMES.challengeUsername)?.value
  const challengeName = request.cookies.get(AUTH_COOKIE_NAMES.challengeName)?.value as ChallengeNameType | undefined
  const body = await request.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const responseKey = challengeName ? RESPONSE_KEYS[challengeName] : undefined

  if (!session || !username || !challengeName || !responseKey || !/^[A-Za-z0-9-]{4,12}$/.test(code)) {
    return clearChallenge(privateJson(
      { error: 'La verificación expiró o el código no es válido. Inicia sesión nuevamente.' },
      400
    ))
  }

  try {
    const tenant = tenantForRequest(request)
    const result = await getCognitoClient().send(new RespondToAuthChallengeCommand({
      ClientId: tenant.clientId,
      ChallengeName: challengeName,
      Session: session,
      ChallengeResponses: {
        USERNAME: username,
        [responseKey]: code,
      },
    }))
    const auth = result.AuthenticationResult
    if (!auth?.IdToken) {
      return clearChallenge(privateJson({ error: 'No se pudo completar la verificación.' }, 409))
    }
    const access = await verifyApplicationAccess(request, auth.IdToken)
    if (!access.ok) return clearChallenge(privateJson({ error: access.error }, access.status))

    const response = clearChallenge(privateJson({ ok: true }))
    response.cookies.set(AUTH_COOKIE_NAMES.session, auth.IdToken, {
      ...authCookieOptions(),
      maxAge: sessionMaxAge(auth.ExpiresIn),
    })
    if (auth.RefreshToken) {
      response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, auth.RefreshToken, {
        ...authCookieOptions(),
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      })
    }
    return response
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    if (name === 'CodeMismatchException') {
      return privateJson({ error: 'El código no coincide. Revisa e intenta nuevamente.' }, 400)
    }
    if (name === 'ExpiredCodeException' || name === 'NotAuthorizedException') {
      return clearChallenge(privateJson(
        { error: 'El código expiró. Inicia sesión nuevamente para solicitar otro.' },
        401
      ))
    }
    if (name === 'TooManyRequestsException' || name === 'LimitExceededException') {
      return privateJson({ error: 'Demasiados intentos. Espera un momento y vuelve a intentar.' }, 429)
    }
    console.error('Cognito challenge failed', { reason: name, challengeName })
    return privateJson({ error: 'La verificación no está disponible temporalmente.' }, 503)
  }
}
