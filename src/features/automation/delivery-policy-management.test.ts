import { describe, expect, it } from 'vitest'
import type { DeliveryRepositoryPolicySuggestion } from './delivery-types'
import { policySuggestionDraft } from './delivery-policy-management'

const repository = 'github://acme/dashboard'

describe('policySuggestionDraft', () => {
  it('converts only a conservative onboarding baseline into a repository-scoped ledger draft', () => {
    expect(
      policySuggestionDraft(
        {
          level: 'repository',
          repository_reference: repository,
          mode: 'review_only',
          required_test_kinds: ['e2e', 'unit'],
          allowed_target_branches: ['trunk'],
          reason: 'Static onboarding only proposes a review-only baseline.',
          required_operator_decisions: ['choose a merge method before enabling merge'],
          provenance: [],
        },
        repository
      )
    ).toMatchObject({
      scope: 'repository',
      mode: 'review_only',
      requiredTestKinds: 'e2e, unit',
      allowedTargetBranches: 'trunk',
    })
  })

  it('rejects any suggestion that could bypass a policy decision or target another repository', () => {
    const base = {
      level: 'repository' as const,
      repository_reference: repository,
      mode: 'review_only' as const,
      required_test_kinds: [] as string[],
      allowed_target_branches: ['main'],
      reason: 'Static onboarding only proposes a review-only baseline.',
      required_operator_decisions: ['choose a merge method before enabling merge'],
      provenance: [],
    }
    expect(
      policySuggestionDraft(
        {
          ...base,
          mode: 'release',
        } as unknown as DeliveryRepositoryPolicySuggestion,
        repository
      )
    ).toBeNull()
    expect(policySuggestionDraft({ ...base, repository_reference: 'github://acme/other' }, repository)).toBeNull()
    expect(policySuggestionDraft({ ...base, allowed_target_branches: ['main*'] }, repository)).toBeNull()
  })
})
