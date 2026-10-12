/**
 * Global access policy of one user for one product, as the backend
 * (controllers/accesspolicies) returns it. `inherited` means there is no
 * explicit policy: the user keeps what roles and memberships give them, and
 * `capabilities` is an empty list that must NOT be read as "no access".
 */
export type AccessPolicyMode = 'inherited' | 'explicit'

export type AccessPolicy = {
  mode: AccessPolicyMode
  isActive: boolean
  capabilities: string[]
}

export const ACCESS_POLICY_PRODUCTS = {
  itbem: [
    'dashboard:view',
    'metrics:view',
    'audit:view',
    'automation:view',
    'automation:manage',
    'platform:users:view',
    'organizations:view',
    'members:manage',
  ],
  eventiapp: [
    'dashboard:view',
    'metrics:view',
    'events:view',
    'events:create',
    'events:manage',
    'guests:manage',
    'checkin:run',
    'analytics:view',
    'members:manage',
  ],
  cafettonhouse: [
    'dashboard:view',
    'metrics:view',
    'events:view',
    'events:create',
    'events:manage',
    'guests:manage',
    'checkin:run',
    'analytics:view',
    'members:manage',
  ],
} as const

export type AccessPolicyProduct = keyof typeof ACCESS_POLICY_PRODUCTS

export const ACCESS_POLICY_PRODUCT_LABELS: Record<AccessPolicyProduct, string> = {
  itbem: 'ITBEM',
  eventiapp: 'EventiApp',
  cafettonhouse: 'Cafetton House',
}

const CAPABILITY_LABELS: Record<string, string> = {
  'dashboard:view': 'Ver inicio',
  'metrics:view': 'Ver métricas',
  'audit:view': 'Ver auditoría',
  'automation:view': 'Ver automatizaciones',
  'automation:manage': 'Administrar automatizaciones',
  'platform:users:view': 'Ver usuarios de la plataforma',
  'organizations:view': 'Ver organizaciones',
  'members:manage': 'Administrar miembros',
  'events:view': 'Ver eventos',
  'events:create': 'Crear eventos',
  'events:manage': 'Administrar eventos',
  'guests:manage': 'Administrar invitados',
  'checkin:run': 'Registrar entradas (check-in)',
  'analytics:view': 'Ver analíticas',
}

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability
}

export function readAccessPolicy(value: unknown): AccessPolicy {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const capabilities = Array.isArray(data.capabilities)
    ? data.capabilities.filter((item): item is string => typeof item === 'string')
    : []
  return {
    mode: data.mode === 'explicit' ? 'explicit' : 'inherited',
    isActive: data.is_active !== false,
    capabilities,
  }
}

function sameCapabilities(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((item) => set.has(item))
}

export function isAccessPolicyDirty(
  loaded: AccessPolicy | null,
  draft: { isActive: boolean; capabilities: readonly string[] }
): boolean {
  if (!loaded) return false
  return loaded.isActive !== draft.isActive || !sameCapabilities(loaded.capabilities, draft.capabilities)
}
