import { PRODUCT_MANIFESTS } from '@/products/registry'
import type { ProductManifest, TenantCode, TenantModule } from '@/products/core/product-manifest'
import type { NextRequest } from 'next/server'

export type { TenantCode, TenantModule } from '@/products/core/product-manifest'

export type TenantConfig = {
  code: TenantCode
  organizationCode: TenantCode
  name: string
  productLabel: string
  hostname: string
  hostnames: readonly string[]
  localHostnames: readonly string[]
  apiHostname: string
  clientId: string
  modules: readonly TenantModule[]
  accent: string
}

type TenantDefinition = Omit<TenantConfig, 'clientId'> & { clientIdEnv: string }

function tenantDefinition(manifest: ProductManifest): TenantDefinition {
  return {
    code: manifest.code,
    organizationCode: manifest.deployment.organizationCode,
    name: manifest.identity.name,
    productLabel: manifest.identity.productLabel,
    accent: manifest.identity.accent,
    hostname: manifest.deployment.hostname,
    hostnames: manifest.deployment.hostnames,
    localHostnames: manifest.deployment.localHostnames,
    apiHostname: manifest.deployment.apiHostname,
    clientIdEnv: manifest.deployment.clientIdEnv,
    modules: manifest.backendModules,
  }
}

const TENANTS = Object.fromEntries(
  Object.entries(PRODUCT_MANIFESTS).map(([code, manifest]) => [code, tenantDefinition(manifest)])
) as Record<TenantCode, TenantDefinition>

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function tenantCodeForHostname(hostname: string): TenantCode {
  const host = normalizedHostname(hostname)
  for (const tenant of Object.values(TENANTS)) {
    if (tenant.hostnames.includes(host) || tenant.localHostnames.includes(host)) return tenant.code
  }

  // Vercel preview deployments are not customer entry points and intentionally
  // use the platform presentation. Production/custom hosts remain fail-closed.
  if (host.endsWith('.vercel.app')) return 'eventiapp'
  throw new Error(`Unknown dashboard hostname: ${host || '(empty)'}`)
}

export function tenantForHostname(
  hostname: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): TenantConfig {
  const code = tenantCodeForHostname(hostname)
  const { clientIdEnv, ...base } = TENANTS[code]
  const dedicatedClientId = env[clientIdEnv]?.trim() || ''
  const isProduction = (env.NODE_ENV ?? process.env.NODE_ENV) === 'production'
  const clientId = dedicatedClientId || (!isProduction ? env.COGNITO_CLIENT_ID?.trim() || '' : '')

  if (!clientId) throw new Error(`Missing dedicated Cognito app client for tenant ${code}`)
  return { ...base, clientId }
}

export function tenantPresentationForHostname(hostname: string): Omit<TenantConfig, 'clientId'> {
  const { clientIdEnv: _, ...tenant } = TENANTS[tenantCodeForHostname(hostname)]
  return tenant
}

export function backendBaseUrlForHostname(hostname: string, localFallback: string): string {
  const tenant = tenantPresentationForHostname(hostname)
  const host = normalizedHostname(hostname)
  if (tenant.localHostnames.includes(host)) return localFallback.replace(/\/+$/, '')
  return `https://${tenant.apiHostname}`
}

export function tenantForRequest(request: NextRequest): TenantConfig {
  return tenantForHostname(request.nextUrl.hostname)
}
