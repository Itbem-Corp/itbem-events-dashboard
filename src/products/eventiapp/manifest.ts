import type { ProductManifest } from '@/products/core/product-manifest'

export const eventiAppManifest = {
  code: 'eventiapp',
  backendModules: ['home', 'events', 'metrics'],
  features: ['home', 'events', 'metrics', 'team', 'audit', 'profile'],
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
