import type { ProductManifest } from '@/products/core/product-manifest'
import { productCatalogEntry } from '@/products/core/product-catalog'
import { eventiAppRoutes } from '@/products/eventiapp/routes'

export const eventiAppManifest = {
  code: 'eventiapp',
  ...productCatalogEntry('eventiapp'),
  backendModules: ['home', 'events', 'metrics'],
  features: ['home', 'events', 'metrics', 'team', 'audit', 'profile'],
  routes: eventiAppRoutes,
  login: {
    index: 'EA / 01',
    discipline: 'Event operations',
    eyebrow: 'Operación en tiempo real',
    title: 'Tu operación empieza aquí.',
    description: 'Invitados, decisiones y momentos importantes bajo un mismo ritmo.',
    context: 'Una consola privada para equipos que producen experiencias en tiempo real.',
    signature: 'EVENTI',
  },
} as const satisfies ProductManifest
