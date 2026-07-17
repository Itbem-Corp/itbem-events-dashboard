import type { ProductManifest } from '@/products/core/product-manifest'

export const itbemManifest = {
  code: 'itbem',
  backendModules: ['home', 'users', 'organizations', 'metrics'],
  features: ['home', 'users', 'organizations', 'metrics', 'team', 'audit', 'profile'],
  login: {
    index: 'IB / 01',
    discipline: 'Business operations',
    eyebrow: 'Control operativo',
    title: 'Claridad para operar mejor.',
    description: 'Organizaciones, accesos y responsabilidad en un solo lugar.',
    context: 'Gobierno operativo para equipos que necesitan precisión sin ruido.',
    signature: 'ITBEM',
  },
} as const satisfies ProductManifest
