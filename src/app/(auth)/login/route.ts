import {
  AUTH_COOKIE_NAMES,
  OAUTH_TRANSACTION_MAX_AGE_SECONDS,
  PRIVATE_NO_STORE_HEADERS,
  authCookieOptions,
} from '@/lib/auth-session'
import { buildCognitoAuthorizeUrl, createOAuthTransaction } from '@/lib/cognito-oauth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const transaction = await createOAuthTransaction()
    const response = NextResponse.redirect(
      buildCognitoAuthorizeUrl(transaction.state, transaction.challenge),
      { status: 307, headers: PRIVATE_NO_STORE_HEADERS }
    )
    const cookieOptions = {
      ...authCookieOptions(),
      maxAge: OAUTH_TRANSACTION_MAX_AGE_SECONDS,
    }

    response.cookies.set(AUTH_COOKIE_NAMES.oauthState, transaction.state, cookieOptions)
    response.cookies.set(AUTH_COOKIE_NAMES.pkceVerifier, transaction.verifier, cookieOptions)
    return response
  } catch {
    return NextResponse.json(
      { error: 'Authentication is temporarily unavailable' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    )
  }
}
