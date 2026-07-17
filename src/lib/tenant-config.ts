import { PRODUCT_MANIFESTS } from '@/products/registry'
import type { NextRequest } from 'next/server'

export type TenantCode = 'eventiapp' | 'itbem' | 'cafettonhouse'
export type TenantModule = 'home' | 'events' | 'users' | 'organizations' | 'metrics'

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

const TENANTS: Record<TenantCode, TenantDefinition> = {
  eventiapp: {
    code: 'eventiapp',
    organizationCode: 'eventiapp',
    name: 'EventiApp',
    productLabel: 'Event operations',
    hostname: 'dashboard.eventiapp.com.mx',
    hostnames: ['dashboard.eventiapp.com.mx'],
    localHostnames: ['localhost', '127.0.0.1', 'dashboard.eventiapp.localhost'],
    apiHostname: 'api.eventiapp.com.mx',
    clientIdEnv: 'COGNITO_EVENTIAPP_CLIENT_ID',
    modules: PRODUCT_MANIFESTS.eventiapp.backendModules,
    accent: '#818cf8',
  },
  itbem: {
    code: 'itbem',
    organizationCode: 'itbem',
    name: 'ITBEM',
    productLabel: 'Business operations',
    hostname: 'dashboard.itbem.com.mx',
    hostnames: ['dashboard.itbem.com.mx', 'dashboard.itbem.com'],
    localHostnames: ['dashboard.itbem.localhost'],
    apiHostname: 'api.itbem.com.mx',
    clientIdEnv: 'COGNITO_ITBEM_CLIENT_ID',
    modules: PRODUCT_MANIFESTS.itbem.backendModules,
    accent: '#22d3ee',
  },
  cafettonhouse: {
    code: 'cafettonhouse',
    organizationCode: 'cafettonhouse',
    name: 'Cafetton House',
    productLabel: 'Client operations',
    hostname: 'dashboard.cafettonhouse.com',
    hostnames: ['dashboard.cafettonhouse.com'],
    localHostnames: ['dashboard.cafettonhouse.localhost'],
    apiHostname: 'api.cafettonhouse.com',
    clientIdEnv: 'COGNITO_CAFETTONHOUSE_CLIENT_ID',
    modules: PRODUCT_MANIFESTS.cafettonhouse.backendModules,
    accent: '#d97706',
  },
}

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
