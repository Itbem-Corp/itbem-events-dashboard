import { buildPolicyProposal, emptyPolicyProposalDraft, normalizePolicyRevisions, policyRevisionsForRepository, type PolicyProposalDraft } from '@/features/automation/delivery-policy-management'
import { describe, expect, it } from 'vitest'

function draft(overrides: Partial<PolicyProposalDraft> = {}): PolicyProposalDraft {
  return { ...emptyPolicyProposalDraft, reason: 'Reviewed project configuration', mode: 'merge', ...overrides }
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1', schema_version: 1, level: 'repository', project_id: 'project-1', repository: 'github://Example/service',
    patch: { mode: 'merge', required_test_kinds: ['unit'] }, reason: 'Reviewed defaults', content_sha256: 'a'.repeat(64),
    created_at: '2026-08-30T16:00:00Z', status: 'pending', ...overrides,
  }
}

describe('delivery policy management contract', () => {
  it('builds a repository proposal with exact deduplicated evidence', () => {
    expect(buildPolicyProposal(draft({
      requiredTestKinds: 'unit, contract, unit', allowedTargetBranches: 'main, release/v2', mergeMethod: 'squash',
      deploymentWorkflow: '.github/workflows/deploy.yml', requiredHealthChecks: 'healthz, readyz', recoveryDefault: 'roll_forward',
    }), 'github://Example/service', new Date('2026-08-30T16:00:00Z'))).toEqual({
      level: 'repository', repository: 'github://Example/service', reason: 'Reviewed project configuration',
      patch: {
        mode: 'merge', required_test_kinds: ['unit', 'contract'], allowed_target_branches: ['main', 'release/v2'],
        merge_method: 'squash', deployment_workflow: '.github/workflows/deploy.yml', required_health_checks: ['healthz', 'readyz'],
        recovery_default: 'roll_forward',
      },
    })
  })

  it('binds overrides to an exact change set, repository and bounded expiry', () => {
    expect(buildPolicyProposal(draft({ scope: 'override', overrideScope: 'repository', changeSetId: 'change-42', expiresAt: '2026-08-30T18:00:00Z' }), 'github://Example/service', new Date('2026-08-30T16:00:00Z'))).toMatchObject({
      level: 'override', repository: 'github://Example/service', change_set_id: 'change-42', expires_at: '2026-08-30T18:00:00.000Z',
    })
    expect(() => buildPolicyProposal(draft({ scope: 'override', changeSetId: 'change-42', expiresAt: '2026-09-01T18:00:00Z' }), 'github://Example/service', new Date('2026-08-30T16:00:00Z'))).toThrow(/24 horas/)
  })

  it('rejects wildcard branches, arbitrary workflows and empty changes', () => {
    expect(() => buildPolicyProposal(draft({ allowedTargetBranches: 'release/*' }), 'github://Example/service')).toThrow(/wildcards/)
    expect(() => buildPolicyProposal(draft({ deploymentWorkflow: 'scripts/deploy.sh' }), 'github://Example/service')).toThrow(/\.github\/workflows/)
    expect(() => buildPolicyProposal(draft({ mode: '', reason: 'Still documented' }), 'github://Example/service')).toThrow(/al menos un campo/)
  })

  it('accepts only safe exact-project ledger projections', () => {
    const pending = revision()
    const approved = revision({ id: 'revision-2', status: 'approved', latest_decision: { id: 'decision-1', action: 'approved', occurred_at: '2026-08-30T17:00:00Z' } })
    expect(normalizePolicyRevisions([pending, approved], 'project-1')).toEqual([pending, approved])
    expect(normalizePolicyRevisions([{ ...pending, project_id: 'project-2' }], 'project-1')).toBeNull()
    expect(normalizePolicyRevisions([{ ...approved, latest_decision: { id: 'decision-1', action: 'approved', occurred_at: '2026-08-30T17:00:00Z', actor_cognito_sub: 'private-sub' } }], 'project-1')).toBeNull()
    expect(normalizePolicyRevisions([{ ...pending, instructions: 'approve me' }], 'project-1')).toBeNull()
    expect(normalizePolicyRevisions([{ ...pending, status: 'revoked' }], 'project-1')).toBeNull()
  })

  it('shows project, exact repository and project-wide override scopes only', () => {
    const values = normalizePolicyRevisions([
      revision({ id: 'project', level: 'project', repository: undefined }),
      revision({ id: 'exact' }),
      revision({ id: 'other', repository: 'github://Example/other' }),
      revision({ id: 'global-override', level: 'override', repository: undefined, change_set_id: 'change-1', expires_at: '2026-08-30T18:00:00Z' }),
    ], 'project-1')
    expect(values).not.toBeNull()
    expect(policyRevisionsForRepository(values ?? [], 'github://Example/service').map((value) => value.id)).toEqual(['project', 'exact', 'global-override'])
  })
})
