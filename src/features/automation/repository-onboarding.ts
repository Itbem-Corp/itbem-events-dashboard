import type {
  DeliveryProjectVaultRevision,
  DeliveryRepositoryCapability,
  DeliveryRepositoryOnboarding,
} from './delivery-types'

export const capabilityLabels: Record<DeliveryRepositoryCapability['name'], string> = {
  source: 'Código fuente',
  branch_write: 'Escritura de rama',
  pr_write: 'Pull request',
  review: 'Review',
  unit: 'Unitarias',
  integration: 'Integración',
  contract: 'Contrato',
  e2e: 'E2E',
  preview: 'Preview',
  staging: 'Staging',
  release: 'Release',
  health: 'Salud',
  recovery: 'Recovery',
  vault: 'Vault',
}

export function capabilityTone(state: DeliveryRepositoryCapability['state']) {
  if (state === 'ready') return 'emerald' as const
  if (state === 'proposed') return 'amber' as const
  if (state === 'blocked' || state === 'unavailable') return 'rose' as const
  return 'zinc' as const
}

export function onboardingIsApprovable(onboarding: DeliveryRepositoryOnboarding) {
  return onboarding.status === 'proposed' && onboarding.readiness !== 'blocked'
}

export function shortRevision(revision: string) {
  return revision.length >= 12 ? revision.slice(0, 12) : revision
}

export function latestVaultByRepository(revisions: DeliveryProjectVaultRevision[]) {
  const latest = new Map<string, DeliveryProjectVaultRevision>()
  for (const revision of revisions) {
    const current = latest.get(revision.repository_reference)
    if (!current || revision.version > current.version) latest.set(revision.repository_reference, revision)
  }
  return Array.from(latest.values()).sort((left, right) =>
    left.repository_reference.localeCompare(right.repository_reference)
  )
}
