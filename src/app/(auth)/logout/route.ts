import { AUTH_COOKIE_NAMES, PRIVATE_NO_STORE_HEADERS } from '@/lib/auth-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), { headers: PRIVATE_NO_STORE_HEADERS })
  for (const name of Object.values(AUTH_COOKIE_NAMES)) response.cookies.set(name, '', { path: '/', maxAge: 0 })
  response.cookies.set('access_token', '', { path: '/', maxAge: 0 })
  return response
}
