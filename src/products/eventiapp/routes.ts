import type { ProductRouteDefinition } from '@/products/core/product-manifest'

export const eventiAppRoutes = [
  { path: '/', feature: 'home', preload: 'route-and-data' },
  { path: '/events', feature: 'events', preload: 'route-and-data' },
  { path: '/metrics', feature: 'metrics', preload: 'route-and-data' },
  { path: '/team', feature: 'team', preload: 'route' },
  { path: '/audit', feature: 'audit', preload: 'route-and-data' },
  { path: '/settings/profile', feature: 'profile', preload: 'route-and-data' },
] as const satisfies readonly ProductRouteDefinition[]
