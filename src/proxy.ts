import { type NextRequest, NextResponse } from 'next/server'
import { contentSecurityPolicyForHostname } from '@/lib/content-security-policy'

const publicRoutes = ['/login', '/forgot-password', '/register', '/auth', '/logout']
const LOCAL_WARMUP_HEADER = 'x-eventi-local-warmup'
const LOCAL_WARMUP_VALUE = 'route-shell'

function isLocalWarmup(req: NextRequest) {
  return (
    process.env['NODE_ENV'] === 'development' &&
    req.headers.get(LOCAL_WARMUP_HEADER) === LOCAL_WARMUP_VALUE &&
    (req.nextUrl.hostname === 'localhost' || req.nextUrl.hostname === '127.0.0.1')
  )
}

function securityNonce() {
  return crypto.randomUUID().replaceAll('-', '')
}

function externalRequestURL(req: NextRequest) {
  const isLocalRequest = req.nextUrl.hostname === 'localhost' || req.nextUrl.hostname === '127.0.0.1'
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  // Development proxies may reach Next through localhost while the browser is
  // on a product subdomain. Only trust an explicitly local forwarded host;
  // production requests continue to use the URL received by the edge.
  if (!isLocalRequest || !forwardedHost || !/^(?:[a-z0-9-]+\.)*localhost(?::\d+)?$/.test(forwardedHost)) {
    return req.nextUrl
  }

  const external = new URL(req.url)
  external.host = forwardedHost
  external.protocol = forwardedProto === 'https' ? 'https:' : 'http:'
  return external
}

function withTenantSecurityPolicy(req: NextRequest, response: NextResponse, nonce: string) {
  response.headers.set('Content-Security-Policy', contentSecurityPolicyForHostname(req.nextUrl.hostname, process.env, nonce))
  return response
}

export function proxy(req: NextRequest) {
  const nonce = securityNonce()
  // Start-Local uses this localhost-only development request to compile page
  // shells before handing the app to the user. APIs remain outside this
  // matcher and continue to require their normal authentication.
  if (isLocalWarmup(req)) return withTenantSecurityPolicy(req, NextResponse.next(), nonce)

  const session = req.cookies.get('session')
  const refreshToken = req.cookies.get('refresh_token')
  const isPublicRoute = publicRoutes.some(
    (route) =>
      req.nextUrl.pathname === route ||
      (req.nextUrl.pathname.startsWith('/auth') && req.nextUrl.pathname !== '/auth/logout')
  )

  if (!session && !refreshToken && !isPublicRoute) {
    return withTenantSecurityPolicy(req, NextResponse.redirect(new URL('/login', externalRequestURL(req))), nonce)
  }

  // A cookie only proves that the browser once held a session. The BFF
  // verifies audience, expiry and product access, so login stays reachable
  // when the cookie is stale or belongs to another product.

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  return withTenantSecurityPolicy(req, NextResponse.next({ request: { headers: requestHeaders } }), nonce)
}

export const config = {
  matcher: ['/((?!api|automation-bridge|_next/static|_next/image|favicon.ico|eventiapp-icon.svg|images|providers).*)'],
}
