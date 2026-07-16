import { pathToFileURL } from 'node:url'

const DEFAULT_TENANTS = [
  { hostname: 'dashboard.eventiapp.com.mx', brand: 'EventiApp' },
  { hostname: 'dashboard.itbem.com', brand: 'ITBEM' },
  { hostname: 'dashboard.itbem.com.mx', brand: 'ITBEM' },
  { hostname: 'dashboard.cafettonhouse.com', brand: 'Cafetton House' },
]

const REQUIRED_API_ORIGINS = [
  'https://api.eventiapp.com.mx',
  'https://api.itbem.com.mx',
  'https://api.cafettonhouse.com',
]

export function configuredTenants(value = process.env.PRODUCTION_SMOKE_DOMAINS) {
  if (!value?.trim()) return DEFAULT_TENANTS

  return value.split(',').map((entry) => {
    const [hostname, brand] = entry.split('|').map((part) => part.trim())
    if (!hostname || !brand) {
      throw new Error(`Invalid tenant smoke entry "${entry}". Expected hostname|brand.`)
    }
    return { hostname, brand }
  })
}

export function validateLoginResponse(tenant, response, html) {
  if (!response.ok) {
    throw new Error(`${tenant.hostname}: login returned HTTP ${response.status}`)
  }
  if (!html.includes(tenant.brand)) {
    throw new Error(`${tenant.hostname}: expected brand "${tenant.brand}" was not rendered`)
  }

  const cacheControl = response.headers.get('cache-control') ?? ''
  if (!cacheControl.includes('no-store')) {
    throw new Error(`${tenant.hostname}: login is missing a private no-store cache policy`)
  }

  const csp = response.headers.get('content-security-policy') ?? ''
  for (const origin of REQUIRED_API_ORIGINS) {
    if (!csp.includes(origin)) {
      throw new Error(`${tenant.hostname}: CSP does not allow ${origin}`)
    }
  }
  if (!csp.includes("frame-ancestors 'none'")) {
    throw new Error(`${tenant.hostname}: CSP does not prevent framing`)
  }
}

export async function smokeTenant(tenant, fetchImpl = fetch) {
  const baseUrl = `https://${tenant.hostname}`
  const login = await fetchImpl(`${baseUrl}/login`, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  validateLoginResponse(tenant, login, await login.text())

  const auth = await fetchImpl(`${baseUrl}/api/auth/token`, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (auth.status !== 401) {
    throw new Error(`${tenant.hostname}: unauthenticated token endpoint returned HTTP ${auth.status}, expected 401`)
  }

  console.log(`${tenant.hostname}: brand, security headers, and unauthenticated boundary are healthy`)
}

export async function main() {
  for (const tenant of configuredTenants()) {
    await smokeTenant(tenant)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
