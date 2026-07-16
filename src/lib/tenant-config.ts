import type { NextRequest } from 'next/server'

export type TenantCode = 'eventiapp' | 'itbem'
export type TenantModule = 'home' | 'events' | 'users' | 'organizations'

export type TenantConfig = {
  code: TenantCode
  organizationCode: TenantCode
  name: string
  productLabel: string
  hostname: string
  clientId: string
  modules: readonly TenantModule[]
  accent: string
}

const TENANTS: Record<TenantCode, Omit<TenantConfig, 'clientId'>> = {
  eventiapp: {
    code: 'eventiapp',
    organizationCode: 'eventiapp',
    name: 'EventiApp',
    productLabel: 'Event operations',
    hostname: 'dashboard.eventiapp.com.mx',
    modules: ['home', 'events', 'users', 'organizations'],
    accent: '#818cf8',
  },
  itbem: {
    code: 'itbem',
    organizationCode: 'itbem',
    name: 'ITBEM',
    productLabel: 'Event operations',
    hostname: 'dashboard.itbem.com',
    modules: ['home', 'events', 'users', 'organizations'],
    accent: '#22d3ee',
  },
}

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function tenantCodeForHostname(hostname: string): TenantCode {
  const host = normalizedHostname(hostname)
  if (host === TENANTS.itbem.hostname || host.endsWith('.itbem.local')) return 'itbem'
  return 'eventiapp'
}

export function tenantForHostname(
  hostname: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): TenantConfig {
  const code = tenantCodeForHostname(hostname)
  const base = TENANTS[code]
  const clientId =
    (code === 'itbem' ? env.COGNITO_ITBEM_CLIENT_ID : env.COGNITO_EVENTIAPP_CLIENT_ID)?.trim() ||
    env.COGNITO_CLIENT_ID?.trim() ||
    ''

  if (!clientId) throw new Error(`Missing Cognito app client for tenant ${code}`)
  return { ...base, clientId }
}

export function tenantPresentationForHostname(hostname: string): Omit<TenantConfig, 'clientId'> {
  return TENANTS[tenantCodeForHostname(hostname)]
}

export function tenantForRequest(request: NextRequest): TenantConfig {
  return tenantForHostname(request.nextUrl.hostname)
}
