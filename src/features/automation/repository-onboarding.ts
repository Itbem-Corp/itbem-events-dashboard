import type {
  DeliveryProjectVaultRevision,
  DeliveryRepositoryCapability,
  DeliveryRepositoryOnboarding,
  DeliveryVaultEntry,
  DeliveryVaultManifest,
} from './delivery-types'

export type DeliveryVaultEntryDiff = {
  status: 'added' | 'changed' | 'unchanged' | 'removed'
  entry: DeliveryVaultEntry
  previous?: DeliveryVaultEntry
}

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

const fullGitSHA = /^[0-9a-f]{40}$/i

export function validOptionalGitRevision(revision: string) {
  const normalized = revision.trim()
  return normalized === '' || fullGitSHA.test(normalized)
}

export function repositoryInspectionPayload(repositoryURL: string, revision: string) {
  const repository_url = repositoryURL.trim()
  const normalizedRevision = revision.trim().toLowerCase()
  if (!repository_url) throw new Error('repository URL is required')
  if (normalizedRevision && !fullGitSHA.test(normalizedRevision)) {
    throw new Error('revision must be a full Git SHA')
  }
  return normalizedRevision ? { repository_url, revision: normalizedRevision } : { repository_url }
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

// The browser renders a deterministic, reviewable Vault diff before the
// approval mutation. Values are untrusted repository-derived data, so this
// function only compares JSON and never interprets a field as executable UI.
export function vaultManifestDiff(
  proposed: DeliveryVaultManifest,
  current?: DeliveryVaultManifest
): DeliveryVaultEntryDiff[] {
  const previous = new Map((current?.entries ?? []).map((entry) => [entry.key, entry]))
  const result: DeliveryVaultEntryDiff[] = proposed.entries.map((entry) => {
    const prior = previous.get(entry.key)
    previous.delete(entry.key)
    if (entry.lifecycle === 'removed') return { status: 'removed', entry, previous: prior ?? entry }
    if (!prior) return { status: 'added', entry }
    return {
      status:
        canonicalJSON({ kind: prior.kind, value: prior.value }) ===
        canonicalJSON({ kind: entry.kind, value: entry.value })
          ? 'unchanged'
          : 'changed',
      entry,
      previous: prior,
    }
  })
  for (const entry of previous.values()) result.push({ status: 'removed', entry, previous: entry })
  return result.sort((left, right) => left.entry.key.localeCompare(right.entry.key))
}

function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
