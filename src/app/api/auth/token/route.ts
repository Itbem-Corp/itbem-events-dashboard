import {
  AUTH_COOKIE_NAMES,
  PRIVATE_NO_STORE_HEADERS,
  authCookieOptions,
  sessionMaxAge,
} from '@/lib/auth-session'
import { buildCognitoRefreshRequestBody, cognitoTokenUrl } from '@/lib/cognito-oauth'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function privateJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: PRIVATE_NO_STORE_HEADERS,
  })
}

function clearExpiredSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.session, '', { path: '/', maxAge: 0 })
  response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, '', { path: '/', maxAge: 0 })
  return response
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const session = cookieStore.get(AUTH_COOKIE_NAMES.session)
  const refreshToken = cookieStore.get(AUTH_COOKIE_NAMES.refreshToken)
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1'

  if (session && !forceRefresh) return privateJson({ token: session.value })
  if (!refreshToken) return clearExpiredSession(privateJson({ error: 'No session' }, { status: 401 }))

  try {
    const tokenResponse = await fetch(cognitoTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildCognitoRefreshRequestBody(refreshToken.value),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })

    if (!tokenResponse.ok) {
      if (tokenResponse.status >= 500) {
        return privateJson({ error: 'Auth unavailable' }, { status: 503 })
      }
      return clearExpiredSession(privateJson({ error: 'Session expired' }, { status: 401 }))
    }

    const tokens = (await tokenResponse.json()) as { id_token?: unknown; expires_in?: unknown }
    if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
      return privateJson({ error: 'Invalid token response' }, { status: 502 })
    }

    const response = privateJson({ token: tokens.id_token })
    response.cookies.set(AUTH_COOKIE_NAMES.session, tokens.id_token, {
      ...authCookieOptions(),
      maxAge: sessionMaxAge(tokens.expires_in),
    })
    return response
  } catch {
    return privateJson({ error: 'Auth unavailable' }, { status: 503 })
  }
}
