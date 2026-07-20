import type { WorkspaceMode } from '@/lib/access-profile'
import type { TenantCode } from '@/products/core/product-manifest'
import { REQUEST_CONTEXT_HEADERS } from '@/contracts/request-context'

export type ApplicationRequestContext = {
  tenantCode: TenantCode
  workspaceMode: WorkspaceMode
  organizationId: string | null
}

export type ScopedFetcherKey = readonly [
  path: string,
  tenantCode: TenantCode,
  workspaceMode: WorkspaceMode,
  organizationId: string | null,
]

export type ScopedFetcherScope = (path: string) => ScopedFetcherKey

export interface OrganizationContextCredential {
  token: string
  organizationId: string
  expiresAt: string
}

export function scopedFetcherKey(path: string | null, context: ApplicationRequestContext): ScopedFetcherKey | null {
  if (!path) return null
  return [path, context.tenantCode, context.workspaceMode, context.organizationId] as const
}

export function requestPathFromKey(key: string | ScopedFetcherKey): string {
  return typeof key === 'string' ? key : key[0]
}

export function requestPathFromUnknownKey(key: unknown): string | null {
  if (typeof key === 'string') return key
  if (!Array.isArray(key) || typeof key[0] !== 'string') return null
  return key[0]
}

export function requestContextHeaders(
  context: ApplicationRequestContext,
  options: { sessionResolved?: boolean } = {}
): Record<string, string> {
  if (options.sessionResolved === false) {
    return { [REQUEST_CONTEXT_HEADERS.applicationCode]: context.tenantCode }
  }
  return {
    [REQUEST_CONTEXT_HEADERS.applicationCode]: context.tenantCode,
    [REQUEST_CONTEXT_HEADERS.workspaceMode]: context.workspaceMode,
    ...(context.workspaceMode === 'organization' && context.organizationId
      ? { [REQUEST_CONTEXT_HEADERS.organizationId]: context.organizationId }
      : {}),
  }
}

export function organizationContextHeaders(
  context: ApplicationRequestContext,
  credential: OrganizationContextCredential | null | undefined,
  now = Date.now()
): Record<string, string> {
  if (
    context.workspaceMode !== 'organization' ||
    !context.organizationId ||
    credential?.organizationId !== context.organizationId ||
    Date.parse(credential.expiresAt) <= now + 15_000
  ) {
    return {}
  }
  return { [REQUEST_CONTEXT_HEADERS.organizationContext]: credential.token }
}
