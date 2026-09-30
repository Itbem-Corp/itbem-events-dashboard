export type StorageStateOrigin = {
  origin?: string
}

export type StorageStateCookie = {
  domain?: string
}

export type StorageStateLike = {
  origins?: StorageStateOrigin[]
  cookies?: StorageStateCookie[]
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function cookieMatchesHostname(domain: string, hostname: string): boolean {
  const normalized = domain.replace(/^\./, '').toLowerCase()
  const expected = hostname.toLowerCase()
  // A parent cookie such as `.localhost` is deliberately not accepted: it
  // can cross tenant subdomains even when the URL origin looks correct.
  return normalized === expected
}

/**
 * Returns reasons why a Playwright storage state must not be used for the
 * configured dashboard origin. External Cognito origins are allowed; local
 * app origins and cookies must remain scoped to the selected dashboard.
 */
export function storageStateTargetIssues(
  state: StorageStateLike,
  configuredOrigin: string,
): string[] {
  const target = new URL(normalizeOrigin(configuredOrigin))
  const origins = (state.origins ?? [])
    .map((entry) => entry.origin)
    .filter((origin): origin is string => Boolean(origin))
  const cookies = (state.cookies ?? [])
    .map((entry) => entry.domain)
    .filter((domain): domain is string => Boolean(domain))

  const issues: string[] = []
  const localOrigins = origins.filter((origin) => {
    try {
      return isLoopbackHostname(new URL(origin).hostname) || new URL(origin).hostname.endsWith('.localhost')
    } catch {
      return false
    }
  })

  for (const origin of localOrigins) {
    if (normalizeOrigin(origin) !== target.origin) {
      issues.push(`local storage origin ${origin} does not match ${target.origin}`)
    }
  }

  const localCookies = cookies.filter((domain) => {
    const normalized = domain.replace(/^\./, '').toLowerCase()
    return isLoopbackHostname(normalized) || normalized.endsWith('.localhost')
  })
  for (const domain of localCookies) {
    if (!cookieMatchesHostname(domain, target.hostname)) {
      issues.push(`local cookie domain ${domain} does not match ${target.hostname}`)
    }
  }

  const hasAppOrigin = origins.some((origin) => {
    try {
      return normalizeOrigin(origin) === target.origin
    } catch {
      return false
    }
  })
  const hasAppCookie = cookies.some((domain) => cookieMatchesHostname(domain, target.hostname))
  if (!hasAppOrigin && !hasAppCookie) {
    issues.push(`storage state has no session scoped to ${target.origin}`)
  }

  return issues
}

export function assertStorageStateTarget(state: StorageStateLike, configuredOrigin: string): void {
  const issues = storageStateTargetIssues(state, configuredOrigin)
  if (issues.length > 0) {
    throw new Error(
      `Refusing to persist a cross-tenant Playwright session for ${configuredOrigin}:\n- ${issues.join('\n- ')}`,
    )
  }
}
