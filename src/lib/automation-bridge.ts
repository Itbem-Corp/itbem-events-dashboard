import type { NextRequest } from 'next/server'

const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'idempotency-key',
  'if-none-match',
  'last-event-id',
  'x-application-code',
  'x-organization-context',
  'x-organization-id',
  'x-workspace-mode',
] as const

// RFC 3986 lets a path segment carry sub-delims, ':' and '@' unescaped.
// encodeURIComponent escapes them, and Echo matches on the raw path without
// decoding params, so `/guests/all:<id>` must reach the API with a literal ':'.
const SEGMENT_SAFE_ESCAPES = /%(21|24|26|27|28|29|2A|2B|2C|3B|3D|3A|40)/gi

export function encodeBridgePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(SEGMENT_SAFE_ESCAPES, (escape) =>
    decodeURIComponent(escape)
  )
}

/**
 * True when every segment is a plain path segment. Next.js hands the
 * catch-all params over already percent-decoded, so `%2E%2E` arrives as `..`;
 * `new URL` would normalize such segments and let the bridge reach a path
 * outside `/api`. Dot segments, also when hidden behind an encoded separator
 * (`..%2F..`) or a second encoding layer, are refused instead of encoded.
 */
export function bridgePathIsSafe(segments: readonly string[]): boolean {
  return segments.every((segment) => {
    // Also look through a second encoding layer (`%252E%252E`).
    let value = segment
    for (let i = 0; i < 2; i++) {
      try {
        value = decodeURIComponent(value)
      } catch {
        // A stray '%' is not an escape, so it cannot hide a dot segment.
        break
      }
    }
    return value.split(/[/\\]/).every((part) => part !== '.' && part !== '..')
  })
}

function hostnameOf(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim().toLowerCase()
  if (!first) return null
  if (first.startsWith('[')) return first.slice(0, first.indexOf(']') + 1)
  return first.split(':')[0] || null
}

function isLoopbackHostname(hostname: string | null): boolean {
  if (!hostname) return false
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

/**
 * The bridge is a local-development convenience only. A production build, or
 * any request addressed to a non-loopback host, gets a plain 404 so the route
 * can never act as an open relay to the API from a deployed dashboard.
 */
export function bridgeAllowed(request: Pick<NextRequest, 'headers'>, nodeEnv = process.env.NODE_ENV): boolean {
  if (nodeEnv === 'production') return false
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost && !isLoopbackHostname(hostnameOf(forwardedHost))) return false
  return isLoopbackHostname(hostnameOf(request.headers.get('host')))
}

export function forwardedHeaders(request: Pick<NextRequest, 'headers'>) {
  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  // Never relay a client-supplied X-Forwarded-For: Next.js keeps an incoming
  // value as-is and only fills it from the socket when it is missing, so it
  // cannot be trusted here. The bridge only serves loopback-addressed
  // requests (bridgeAllowed), so the caller is this machine.
  headers.set('x-forwarded-for', '127.0.0.1')
  return headers
}
