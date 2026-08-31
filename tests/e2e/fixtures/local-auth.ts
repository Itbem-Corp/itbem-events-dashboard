import fs from 'fs'

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

export function cleanupEphemeralAuthState(ephemeralToken: string | undefined, authFile: string): boolean {
  if (!ephemeralToken?.trim()) return false
  fs.rmSync(authFile, { force: true })
  return true
}
