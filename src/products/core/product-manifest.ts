export type TenantCode = 'eventiapp' | 'itbem' | 'cafettonhouse'
export type TenantModule = 'home' | 'events' | 'users' | 'organizations' | 'metrics' | 'automation'

export type ProductFeature = TenantModule | 'team' | 'audit' | 'profile'

export type ProductRouteDefinition = {
  path: string
  feature: ProductFeature
  preload: 'none' | 'route' | 'route-and-data'
}

export type PublicExperience =
  | { enabled: false }
  | {
      enabled: true
      canonicalHostname: string
      hostnames: readonly string[]
      deploymentTarget: 'cloudflare-workers'
      branding: {
        name: string
        shortName: string
        description: string
        locale: string
        themeColor: string
        backgroundColor: string
      }
    }

/**
 * Optional shell policy. Every key is opt-in: an absent key (or an absent
 * `shell`) keeps today's behaviour, so a product only changes when its own
 * manifest says so. Components read it through useProductManifest().
 */
export type ProductShellPolicy = {
  /** Who sees the workspace block and the organization switcher. */
  workspaceSwitcher?: 'all-multi-organization' | 'organization-admins'
  /**
   * 'caller-access': members without an Owner/Admin role work in one list of
   * everything their memberships and event grants allow (organization mode
   * without an organization ID), instead of choosing an organization.
   */
  memberWorkspace?: 'organization' | 'caller-access'
  /** Where the switcher list comes from for non-root users. */
  workspaceSource?: 'clients-api' | 'clients-api-session-filtered'
  /** Show Spanish role names instead of the raw role codes. */
  localizedRoleLabels?: boolean
  /** 12px minimum text and 44px touch targets in the shell. */
  accessibleShell?: boolean
  /** Hold guarded routes behind a skeleton until the route policy decides. */
  guardBeforeRender?: boolean
}

export type ProductManifest = {
  code: TenantCode
  identity: {
    name: string
    productLabel: string
    accent: string
  }
  deployment: {
    organizationCode: TenantCode
    hostname: string
    hostnames: readonly string[]
    localHostnames: readonly string[]
    apiHostname: string
    clientIdEnv: string
    ownedDomains: readonly string[]
    publicExperience: PublicExperience
  }
  backendModules: readonly TenantModule[]
  features: readonly ProductFeature[]
  routes: readonly ProductRouteDefinition[]
  shell?: ProductShellPolicy
  login: {
    index: string
    discipline: string
    eyebrow: string
    title: string
    description: string
    context: string
    signature: string
  }
}

export const PRODUCT_ROUTE_FEATURES = {
  '/events': 'events',
  '/clients': 'organizations',
  '/users': 'users',
  '/metrics': 'metrics',
  '/automation': 'automation',
  '/team': 'team',
  '/audit': 'audit',
  '/settings/profile': 'profile',
} as const satisfies Record<string, ProductFeature>

export function productSupportsFeature(manifest: ProductManifest, feature: ProductFeature): boolean {
  return manifest.features.includes(feature)
}

function matchesRouteSegment(pathname: string, routePath: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`)
}

export function productSupportsPath(manifest: ProductManifest, pathname: string): boolean {
  // Route families must match whole URL segments. A raw startsWith check would
  // classify an unrelated future path such as /automation-export as the
  // privileged /automation module and could make the client-side product
  // ceiling drift from the explicit manifest.
  const protectedFeature = Object.entries(PRODUCT_ROUTE_FEATURES).find(([prefix]) => matchesRouteSegment(pathname, prefix))?.[1]
  if (!protectedFeature) return true
  return manifest.routes.some((route) => matchesRouteSegment(pathname, route.path) && route.feature === protectedFeature)
}
