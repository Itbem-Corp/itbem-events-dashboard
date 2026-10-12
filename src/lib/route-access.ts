import { accessCan, type AccessProfile } from '@/lib/access-profile'
import { productSupportsFeature, productSupportsPath, type ProductManifest } from '@/products/core/product-manifest'

/**
 * Client-side route ceiling for the dashboard shell. It decides BEFORE a page
 * mounts, so a page the user cannot use never fires its own requests (which
 * used to end in 403 toasts and a silent redirect to "/").
 *
 * This only hides UI. Every API behind these routes is still authorized by the
 * backend (application surface capability + resource checks).
 */
export type RouteAccessDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: 'product' | 'role' }
  | { kind: 'redirect'; to: string }

export interface RouteAccessInput {
  pathname: string
  product: ProductManifest
  accessProfile: AccessProfile
  /** A member-only user whose organization is still being selected. */
  organizationContextPending: boolean
  currentClientTypeCode?: string | null
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Routes that every authenticated user may open; they never depend on a role. */
export function routeNeedsAccessDecision(pathname: string): boolean {
  return !(pathname === '/' || matchesRoute(pathname, '/settings'))
}

export function resolveRouteAccess({
  pathname,
  product,
  accessProfile,
  organizationContextPending,
  currentClientTypeCode,
}: RouteAccessInput): RouteAccessDecision {
  // Product manifests are a client-side ceiling. Even if a future backend
  // configuration grants an unrelated capability, its route stays invisible.
  if (!productSupportsPath(product, pathname)) return { kind: 'deny', reason: 'product' }

  const organization = accessProfile.isOrganizationContext
  const platform = accessProfile.isPlatformContext

  if (matchesRoute(pathname, '/events')) {
    if (organizationContextPending) return { kind: 'allow' }
    const allowed = productSupportsFeature(product, 'events') && organization && accessCan(accessProfile, 'events:view')
    return allowed ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  if (matchesRoute(pathname, '/clients')) {
    const allowed =
      productSupportsFeature(product, 'organizations') && platform && accessCan(accessProfile, 'organizations:view')
    return allowed ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  if (matchesRoute(pathname, '/users')) {
    const allowed = productSupportsFeature(product, 'users') && platform && accessCan(accessProfile, 'platform:users:view')
    if (!allowed) return { kind: 'deny', reason: 'role' }
    // Access policies (/users/:id/access) are governed by Root 1 only; the
    // backend answers 403 to everyone else, so the page must not mount.
    if (/^\/users\/[^/]+\/access(?:\/|$)/.test(pathname) && accessProfile.platformLevel !== 'root_1') {
      return { kind: 'deny', reason: 'role' }
    }
    return { kind: 'allow' }
  }

  if (matchesRoute(pathname, '/metrics')) {
    const allowed = productSupportsFeature(product, 'metrics') && accessCan(accessProfile, 'metrics:view')
    return allowed ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  if (matchesRoute(pathname, '/audit')) {
    const allowed = productSupportsFeature(product, 'audit') && platform && accessCan(accessProfile, 'audit:view')
    return allowed ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  if (matchesRoute(pathname, '/automation')) {
    const canUseAutomation =
      productSupportsFeature(product, 'automation') &&
      platform &&
      (accessCan(accessProfile, 'automation:view') || accessCan(accessProfile, 'automation:manage'))
    if (!canUseAutomation) return { kind: 'deny', reason: 'role' }
    if (matchesRoute(pathname, '/automation/settings') && accessProfile.platformLevel !== 'root_1') {
      return { kind: 'redirect', to: '/automation' }
    }
    return { kind: 'allow' }
  }

  if (matchesRoute(pathname, '/team')) {
    if (organizationContextPending) return { kind: 'allow' }
    const allowed = productSupportsFeature(product, 'team') && organization && accessCan(accessProfile, 'members:manage')
    return allowed ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  if (matchesRoute(pathname, '/sub-clients')) {
    return currentClientTypeCode === 'AGENCY' ? { kind: 'allow' } : { kind: 'deny', reason: 'role' }
  }

  return { kind: 'allow' }
}
