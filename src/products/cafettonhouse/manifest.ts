import type { ProductManifest } from '@/products/core/product-manifest'

export const cafettonHouseManifest = {
  code: 'cafettonhouse',
  backendModules: ['home', 'users', 'organizations', 'metrics'],
  features: ['home', 'users', 'organizations', 'metrics', 'team', 'profile'],
  login: {
    index: 'CH / 01',
    discipline: 'Coffee operations',
    eyebrow: 'Operación diaria',
    title: 'Cada detalle cuenta.',
    description: 'Clientes, equipo y operación cotidiana con una vista clara.',
    context: 'Un espacio privado para cuidar el negocio detrás de cada servicio.',
    signature: 'CAFETTON',
  },
} as const satisfies ProductManifest
