export type TenantCode = 'eventiapp' | 'itbem' | 'cafettonhouse'
export type TenantModule = 'home' | 'events' | 'users' | 'organizations' | 'metrics'

export type ProductFeature = TenantModule | 'team' | 'audit' | 'profile'

export type ProductRouteDefinition = {
  path: string
  feature: ProductFeature
  preload: 'none' | 'route' | 'route-and-data'
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
  }
  backendModules: readonly TenantModule[]
  features: readonly ProductFeature[]
  routes: readonly ProductRouteDefinition[]
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
  '/team': 'team',
  '/audit': 'audit',
  '/settings/profile': 'profile',
} as const satisfies Record<string, ProductFeature>

export function productSupportsFeature(manifest: ProductManifest, feature: ProductFeature): boolean {
  return manifest.features.includes(feature)
}

export function productSupportsPath(manifest: ProductManifest, pathname: string): boolean {
  const protectedFeature = Object.entries(PRODUCT_ROUTE_FEATURES).find(([prefix]) => pathname.startsWith(prefix))?.[1]
  if (!protectedFeature) return true
  return manifest.routes.some((route) => pathname.startsWith(route.path) && route.feature === protectedFeature)
}
