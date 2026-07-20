import { tenantPresentationForHostname } from '@/lib/tenant-config'

type Environment = Readonly<Record<string, string | undefined>>

const ASSET_SOURCES = [
  'https://*.amazonaws.com',
  'https://*.s3.amazonaws.com',
  'https://*.s3.us-east-1.amazonaws.com',
  'https://*.s3.us-east-2.amazonaws.com',
  'https://*.s3.us-west-2.amazonaws.com',
  'https://*.cloudfront.net',
  'https://*.eventiapp.com.mx',
].join(' ')

function normalizedHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

function localBackendOrigin(env: Environment): string {
  const configured = (env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080').trim().replace(/\/+$/, '')
  return configured.replace(/\/api$/i, '')
}

/**
 * A dashboard origin may only connect to the API assigned to its own product.
 * The backend remains physically shared, but the browser policy mirrors the
 * same hostname -> tenant boundary enforced by Cognito and the API.
 */
export function apiOriginForDashboardHostname(hostname: string, env: Environment = process.env): string {
  const normalized = normalizedHostname(hostname)
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized.endsWith('.localhost')) {
    return localBackendOrigin(env)
  }
  return `https://${tenantPresentationForHostname(normalized).apiHostname}`
}

export function contentSecurityPolicyForHostname(
  hostname: string,
  env: Environment = process.env,
  nonce?: string,
): string {
  let apiOrigin = ''
  try {
    apiOrigin = apiOriginForDashboardHostname(hostname, env)
  } catch {
    // Middleware can still issue a safe redirect for an unknown host. The
    // protected server layout rejects that host before it can render a product.
  }
  const astroOrigin = (env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx').trim().replace(/\/+$/, '')
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : ''
  const scriptSources = env.NODE_ENV === 'production'
    ? `script-src 'self'${nonceSource} 'strict-dynamic'`
    : `script-src 'self'${nonceSource} 'unsafe-inline' 'unsafe-eval'`

  return [
    "default-src 'self'",
    scriptSources,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin} ${ASSET_SOURCES}`,
    `media-src 'self' blob: ${apiOrigin} ${ASSET_SOURCES}`,
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin} ${ASSET_SOURCES}`,
    `frame-src 'self' ${astroOrigin}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
