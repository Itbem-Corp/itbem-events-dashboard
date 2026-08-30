import type { DeliveryProjectVaultRevision, DeliveryRepositoryOnboarding } from '@/features/automation/delivery-types'
import {
  capabilityTone,
  latestVaultByRepository,
  onboardingIsApprovable,
  shortRevision,
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
})
