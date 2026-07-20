import type { ProductRouteDefinition } from '@/products/core/product-manifest'

export const itbemRoutes = [
  { path: '/', feature: 'home', preload: 'route' },
  { path: '/clients', feature: 'organizations', preload: 'route-and-data' },
  { path: '/users', feature: 'users', preload: 'route-and-data' },
  { path: '/metrics', feature: 'metrics', preload: 'route-and-data' },
  { path: '/team', feature: 'team', preload: 'route' },
  { path: '/audit', feature: 'audit', preload: 'route-and-data' },
  { path: '/settings/profile', feature: 'profile', preload: 'route-and-data' },
] as const satisfies readonly ProductRouteDefinition[]
