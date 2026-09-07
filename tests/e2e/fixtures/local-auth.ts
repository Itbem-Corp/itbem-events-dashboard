import fs from 'fs'

const LOOPBACK_HOSTNAME = /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.localhost)$/

function parsedLoopbackURL(name: string, value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute loopback URL`)
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '::1'
  if (!loopback || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP(S) loopback URL without credentials, query, or fragment`)
  }
  return parsed
}

export function localAuthTargets(baseURL: string | undefined, backendURL: string | undefined) {
  if (!baseURL || !backendURL) {
    throw new Error('PLAYWRIGHT_BASE_URL and E2E_BACKEND_URL are required for ephemeral local OIDC authentication')
  }
  return {
    dashboard: parsedLoopbackURL('PLAYWRIGHT_BASE_URL', baseURL),
    backend: parsedLoopbackURL('E2E_BACKEND_URL', backendURL),
  }
}

export function requireEphemeralIDToken(value: string | undefined): string {
  const token = value?.trim() ?? ''
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error('E2E_ID_TOKEN must be a non-empty compact JWT')
  }
  return token
}

/**
 * Converts an explicit, loopback-only host map into Chromium resolver rules.
 *
 * Some Linux runners do not inherit the browser's `.localhost` resolver even
 * though the dashboard is listening on loopback. Mapping the actual hostname
 * (rather than forging x-forwarded-host) keeps tenant selection, cookies and
 * browser-origin checks on the same production-like path. The value is
 * deliberately constrained to loopback so an E2E environment variable cannot
 * redirect a local qualification to an external service.
 */
export function chromiumLoopbackHostResolverRules(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('E2E_LOOPBACK_HOSTS_JSON must be a JSON object mapping .localhost hostnames to 127.0.0.1')
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('E2E_LOOPBACK_HOSTS_JSON must be a JSON object mapping .localhost hostnames to 127.0.0.1')
  }

  const mappings = Object.entries(parsed as Record<string, unknown>)
    .map(([hostname, address]) => [hostname.trim().toLowerCase(), typeof address === 'string' ? address.trim() : ''] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  if (mappings.length === 0 || mappings.some(([hostname, address]) => !LOOPBACK_HOSTNAME.test(hostname) || address !== '127.0.0.1')) {
    throw new Error('E2E_LOOPBACK_HOSTS_JSON only permits .localhost hostnames mapped to 127.0.0.1')
  }

  return mappings.map(([hostname]) => `MAP ${hostname} 127.0.0.1`).join(',')
}

export function cleanupEphemeralAuthState(ephemeralToken: string | undefined, authFile: string): boolean {
  if (!ephemeralToken?.trim()) return false
  fs.rmSync(authFile, { force: true })
  return true
}
