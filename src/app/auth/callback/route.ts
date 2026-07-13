import {
  AUTH_COOKIE_NAMES,
  PRIVATE_NO_STORE_HEADERS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  authCookieOptions,
  sessionMaxAge,
} from '@/lib/auth-session'
import {
  buildCognitoTokenRequestBody,
  cognitoTokenUrl,
  oauthValuesMatch,
} from '@/lib/cognito-oauth'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CognitoTokenResponse = {
  id_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
}

function clearOAuthTransaction(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.oauthState, '', { path: '/', maxAge: 0 })
  response.cookies.set(AUTH_COOKIE_NAMES.pkceVerifier, '', { path: '/', maxAge: 0 })
  return response
}

function callbackError(req: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url), {
    headers: PRIVATE_NO_STORE_HEADERS,
  })
  return clearOAuthTransaction(response)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const returnedState = req.nextUrl.searchParams.get('state') ?? ''
  const expectedState = req.cookies.get(AUTH_COOKIE_NAMES.oauthState)?.value ?? ''
  const codeVerifier = req.cookies.get(AUTH_COOKIE_NAMES.pkceVerifier)?.value ?? ''

  if (!oauthValuesMatch(expectedState, returnedState)) {
    return callbackError(req, 'invalid_state')
  }
  if (req.nextUrl.searchParams.has('error')) return callbackError(req, 'oauth_denied')
  if (!code) return callbackError(req, 'no_code')
  if (!codeVerifier) return callbackError(req, 'invalid_state')

  try {
    const tokenRes = await fetch(cognitoTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildCognitoTokenRequestBody(code, process.env, codeVerifier),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })

    if (!tokenRes.ok) {
      console.error('Cognito token exchange failed', { status: tokenRes.status })
      return callbackError(req, 'invalid_token')
    }

    const tokens = (await tokenRes.json()) as CognitoTokenResponse
    if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
      return callbackError(req, 'invalid_token')
    }

    const response = clearOAuthTransaction(
      NextResponse.redirect(new URL('/', req.url), { headers: PRIVATE_NO_STORE_HEADERS })
    )
    const cookieOptions = authCookieOptions()
    response.cookies.set(AUTH_COOKIE_NAMES.session, tokens.id_token, {
      ...cookieOptions,
      maxAge: sessionMaxAge(tokens.expires_in),
    })

    if (typeof tokens.refresh_token === 'string' && tokens.refresh_token) {
      response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, tokens.refresh_token, {
        ...cookieOptions,
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      })
    } else {
      response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, '', { path: '/', maxAge: 0 })
    }

    return response
  } catch (error) {
    console.error('Cognito callback failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    })
    return callbackError(req, 'server_error')
  }
}
