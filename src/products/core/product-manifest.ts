import type { TenantCode, TenantModule } from '@/lib/tenant-config'

export type ProductFeature = TenantModule | 'team' | 'audit' | 'profile'

export type ProductManifest = {
  code: TenantCode
  backendModules: readonly TenantModule[]
  features: readonly ProductFeature[]
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
  const route = Object.entries(PRODUCT_ROUTE_FEATURES).find(([prefix]) => pathname.startsWith(prefix))
  return route ? productSupportsFeature(manifest, route[1]) : true
}
