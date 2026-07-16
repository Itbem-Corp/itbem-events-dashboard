import { type NextRequest, NextResponse } from 'next/server'
import { tenantCodeForHostname } from '@/lib/tenant-config'

const publicRoutes = ['/login', '/auth', '/logout']
const LOCAL_WARMUP_HEADER = 'x-eventi-local-warmup'
const LOCAL_WARMUP_VALUE = 'route-shell'

function isLocalWarmup(req: NextRequest) {
  return (
    process.env.NODE_ENV === 'development' &&
    req.headers.get(LOCAL_WARMUP_HEADER) === LOCAL_WARMUP_VALUE &&
    (req.nextUrl.hostname === 'localhost' || req.nextUrl.hostname === '127.0.0.1')
  )
}

export function middleware(req: NextRequest) {
  // Start-Local uses this localhost-only development request to compile page
  // shells before handing the app to the user. APIs remain outside this
  // matcher and continue to require their normal authentication.
  if (isLocalWarmup(req)) return NextResponse.next()

  const session = req.cookies.get('session')
  const tenantCode = tenantCodeForHostname(req.nextUrl.hostname)
  const isPublicRoute = publicRoutes.some(
    (route) =>
      req.nextUrl.pathname === route ||
      (req.nextUrl.pathname.startsWith('/auth') && req.nextUrl.pathname !== '/auth/logout')
  )

  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (session && tenantCode === 'itbem' && (req.nextUrl.pathname.startsWith('/users') || req.nextUrl.pathname.startsWith('/clients'))) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (session && isPublicRoute && req.nextUrl.pathname !== '/' && req.nextUrl.pathname !== '/logout') {
    if (req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
}
