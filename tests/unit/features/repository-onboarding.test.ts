import type { DeliveryProjectVaultRevision, DeliveryRepositoryOnboarding } from '@/features/automation/delivery-types'
import {
  capabilityTone,
  latestVaultByRepository,
  onboardingIsApprovable,
  shortRevision,
  vaultManifestDiff,
} from '@/features/automation/repository-onboarding'
import { describe, expect, it } from 'vitest'

describe('repository onboarding view model', () => {
  it('never presents unknown capability as ready', () => {
    expect(capabilityTone('ready')).toBe('emerald')
    expect(capabilityTone('proposed')).toBe('amber')
    expect(capabilityTone('unknown')).toBe('zinc')
    expect(capabilityTone('blocked')).toBe('rose')
  })

  it('requires a non-blocked proposal before showing approval', () => {
    const onboarding = { status: 'proposed', readiness: 'partially_ready' } as DeliveryRepositoryOnboarding
    expect(onboardingIsApprovable(onboarding)).toBe(true)
    expect(onboardingIsApprovable({ ...onboarding, readiness: 'blocked' })).toBe(false)
    expect(onboardingIsApprovable({ ...onboarding, status: 'approved' })).toBe(false)
  })

  it('selects the latest immutable Vault version per repository', () => {
    const revisions = [
      { id: 'a1', repository_reference: 'github://acme/api', version: 1 },
      { id: 'w1', repository_reference: 'github://acme/web', version: 1 },
      { id: 'a2', repository_reference: 'github://acme/api', version: 2 },
    ] as DeliveryProjectVaultRevision[]
    expect(latestVaultByRepository(revisions).map(({ id }) => id)).toEqual(['a2', 'w1'])
    expect(shortRevision('0123456789abcdef')).toBe('0123456789ab')
  })

  it('builds an exact Vault diff including removed entries and provenance changes', () => {
    const proof = { source: 'static_inventory', path: 'go.mod', revision: 'a'.repeat(40), confidence: 0.9 }
    const repository = { reference: 'github://acme/api', default_branch: 'trunk', revision: 'a'.repeat(40) }
    const current = {
      schema_version: 1,
      scope: 'repository' as const,
      repository,
      entries: [
        {
          key: 'changed',
          kind: 'testing',
          lifecycle: 'active' as const,
          value: { command: 'old' },
          provenance: [proof],
        },
        {
          key: 'removed',
          kind: 'workflow',
          lifecycle: 'active' as const,
          value: { path: 'old.yml' },
          provenance: [proof],
        },
        {
          key: 'stable',
          kind: 'repository',
          lifecycle: 'active' as const,
          value: { branch: 'trunk' },
          provenance: [proof],
        },
      ],
    }
    const proposed = {
      ...current,
      entries: [
        {
          key: 'added',
          kind: 'ownership',
          lifecycle: 'active' as const,
          value: { path: 'CODEOWNERS' },
          provenance: [proof],
        },
        {
          key: 'changed',
          kind: 'testing',
          lifecycle: 'active' as const,
          value: { command: 'new' },
          provenance: [proof],
        },
        {
          key: 'stable',
          kind: 'repository',
          lifecycle: 'active' as const,
          value: { branch: 'trunk' },
          provenance: [proof],
        },
      ],
    }
    expect(vaultManifestDiff(proposed, current).map(({ entry, status }) => [entry.key, status])).toEqual([
      ['added', 'added'],
      ['changed', 'changed'],
      ['removed', 'removed'],
      ['stable', 'unchanged'],
    ])
  })
})
