// Single source for the hosts next/image may optimize.
//
// next.config.mjs builds `images.remotePatterns` from this module and the
// client-side <SafeImage> uses the same patterns to decide, before rendering,
// whether a URL can go through the optimizer. A URL from any other host is
// rendered unoptimized instead of letting next/image throw ("hostname is not
// configured"), which used to take down the whole event page.
//
// Extra hosts (for example the local S3 emulator) come from
// NEXT_PUBLIC_IMAGE_REMOTE_HOSTS: a comma-separated list of origins such as
// `http://host.docker.internal:4566,https://media.example.com`. A hostname may
// start with `*.` (one label) or `**.` (any depth), followed by at least two
// literal labels: `**.example.com` is accepted, a TLD-wide `**.com` or
// `*.localhost` is not, and neither is a wildcard over an IP address. Invalid
// entries are ignored.

/** Production patterns. Keep in sync with what the media buckets/CDN serve. */
export const BASE_IMAGE_REMOTE_PATTERNS = Object.freeze([
  Object.freeze({ protocol: 'https', hostname: '**.amazonaws.com' }),
  Object.freeze({ protocol: 'https', hostname: '**.cloudfront.net' }),
  // CDN subdomains (cdn.eventiapp.com.mx, cdn-staging.eventiapp.com.mx)
  Object.freeze({ protocol: 'https', hostname: '**.eventiapp.com.mx' }),
])

const DEFAULT_BACKEND_URL = 'http://localhost:8080'

function backendOrigin(value) {
  const raw = (typeof value === 'string' && value.trim()) || DEFAULT_BACKEND_URL
  return raw.replace(/\/+$/, '').replace(/\/api$/i, '')
}

/**
 * @param {string} origin
 * @returns {{ protocol: 'http' | 'https', hostname: string, port?: string } | null}
 */
export function originToRemotePattern(origin) {
  const value = typeof origin === 'string' ? origin.trim() : ''
  if (!value) return null
  // URL() rejects `*` in hostnames, so parse the wildcard prefix separately.
  const match = /^(https?):\/\/((?:\*\*?\.)?)([^/:?#]+)(?::(\d+))?\/?$/i.exec(value)
  if (!match) return null
  const [, protocol, wildcard, host, port] = match
  let hostname
  try {
    hostname = new URL(`${protocol}://${host}`).hostname
  } catch {
    return null
  }
  if (!hostname) return null
  if (wildcard) {
    // A wildcard must stay inside one registrable domain; otherwise
    // /_next/image becomes an optimizer proxy for a whole TLD.
    const labels = hostname.split('.')
    if (labels.length < 2 || labels.some((label) => !label)) return null
    if (/^\d+$/.test(labels[labels.length - 1]) || hostname.startsWith('[')) return null
  }
  return {
    protocol: /** @type {'http' | 'https'} */ (protocol.toLowerCase()),
    hostname: `${wildcard}${hostname}`,
    ...(port ? { port } : {}),
  }
}

/**
 * @param {{ backendUrl?: string, extraHosts?: string }} [env]
 */
export function buildImageRemotePatterns(env = {}) {
  const patterns = []
  const backend = originToRemotePattern(new URL(backendOrigin(env.backendUrl)).origin)
  if (backend) patterns.push(backend)
  patterns.push(...BASE_IMAGE_REMOTE_PATTERNS.map((pattern) => ({ ...pattern })))
  for (const entry of String(env.extraHosts ?? '').split(',')) {
    const pattern = originToRemotePattern(entry)
    if (pattern) patterns.push(pattern)
  }
  return patterns
}

function hostnameMatches(pattern, hostname) {
  if (pattern.startsWith('**.')) {
    const suffix = pattern.slice(2) // ".example.com"
    return hostname.endsWith(suffix) && hostname.length > suffix.length
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1)
    if (!hostname.endsWith(suffix)) return false
    const label = hostname.slice(0, -suffix.length)
    return label.length > 0 && !label.includes('.')
  }
  return pattern === hostname
}

/**
 * True when next/image can optimize `src` with these patterns: same-origin
 * paths and URLs whose protocol, host and port match a pattern.
 * @param {string} src
 * @param {ReadonlyArray<{ protocol?: string, hostname: string, port?: string }>} patterns
 */
export function isOptimizableImageSrc(src, patterns) {
  const value = typeof src === 'string' ? src.trim() : ''
  if (!value) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return patterns.some((pattern) => {
    if (pattern.protocol && `${pattern.protocol}:` !== url.protocol) return false
    // Same semantics as next/image: an omitted port matches any port.
    if (pattern.port !== undefined && pattern.port !== url.port) return false
    return hostnameMatches(pattern.hostname, url.hostname)
  })
}

/**
 * True when `src` can be put in an <img> at all (absolute http(s), a
 * same-origin path, or a local blob/data preview).
 * @param {string} src
 */
export function isRenderableImageSrc(src) {
  const value = typeof src === 'string' ? src.trim() : ''
  if (!value) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (/^(blob:|data:image\/)/i.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
