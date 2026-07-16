import { PRIVATE_NO_STORE_HEADERS } from '@/lib/auth-session'
import { authRequestIsSameOrigin, getCognitoClient } from '@/lib/cognito-direct'
import { tenantForRequest } from '@/lib/tenant-config'
import { ConfirmForgotPasswordCommand, ForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { NextRequest, NextResponse } from 'next/server'

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
}

export async function POST(request: NextRequest) {
  if (!authRequestIsSameOrigin(request)) return reply({ error: 'Solicitud no válida.' }, 403)
  const body = (await request.json().catch(() => null)) as {
    email?: unknown
    code?: unknown
    password?: unknown
  } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254) return reply({ error: 'Ingresa un correo válido.' }, 400)
  const isConfirmation = body?.code !== undefined || body?.password !== undefined
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (isConfirmation && (!/^[A-Za-z0-9-]{4,12}$/.test(code) || password.length < 8 || password.length > 256)) {
    return reply({ error: 'Revisa el código y usa una contraseña de al menos 8 caracteres.' }, 400)
  }

  try {
    const tenant = tenantForRequest(request)
    if (isConfirmation) {
      await getCognitoClient().send(
        new ConfirmForgotPasswordCommand({
          ClientId: tenant.clientId,
          Username: email,
          ConfirmationCode: code,
          Password: password,
        })
      )
      return reply({ ok: true })
    }
    await getCognitoClient().send(new ForgotPasswordCommand({ ClientId: tenant.clientId, Username: email }))
    return reply({ ok: true, codeSent: true })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    // Do not disclose whether an account exists.
    if (name === 'UserNotFoundException') return reply({ ok: true, codeSent: true })
    if (name === 'CodeMismatchException' || name === 'ExpiredCodeException')
      return reply({ error: 'El código no es válido o ya expiró.' }, 400)
    if (name === 'InvalidPasswordException')
      return reply({ error: 'La contraseña no cumple la política de seguridad.' }, 400)
    if (name === 'LimitExceededException' || name === 'TooManyRequestsException')
      return reply({ error: 'Espera un momento antes de volver a intentar.' }, 429)
    return reply({ error: 'No pudimos procesar la recuperación ahora.' }, 503)
  }
}
