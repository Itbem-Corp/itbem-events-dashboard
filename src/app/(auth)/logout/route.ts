import { RevokeTokenCommand } from '@aws-sdk/client-cognito-identity-provider'
import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS } from '@/lib/auth-session'
import { getCognitoClient } from '@/lib/cognito-direct'
import { tenantForRequest } from '@/lib/tenant-config'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refreshToken)?.value
  if (refreshToken) {
    try {
      const tenant = tenantForRequest(request)
      await getCognitoClient().send(new RevokeTokenCommand({
        ClientId: tenant.clientId,
        Token: refreshToken,
      }))
    } catch (error) {
      console.warn('Cognito token revocation failed during logout', {
        reason: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }
  const response = NextResponse.redirect(new URL('/login', request.url), { headers: PRIVATE_NO_STORE_HEADERS })
  for (const name of Object.values(AUTH_COOKIE_NAMES)) response.cookies.set(name, '', { path: '/', maxAge: 0 })
  response.cookies.set('access_token', '', { path: '/', maxAge: 0 })
  return response
}
