import { effectivePolicyModeLabel, normalizeEffectivePolicySnapshot } from '@/features/automation/effective-policy'
import { describe, expect, it } from 'vitest'

function snapshot() {
  return {
    schema_version: 1,
    project_id: 'project-1',
    repository: 'github://example/service',
    overrides_considered: false,
    evaluated_at: '2026-08-30T15:00:00Z',
    vault: { revision_id: 'vault-1', version: 2, repository_sha: 'a'.repeat(40), content_sha256: 'b'.repeat(64) },
    policy: {
      schema_version: 1,
      mode: 'merge',
      required_test_kinds: ['unit'],
      allowed_target_branches: ['trunk'],
      merge_method: 'squash',
      required_health_checks: [],
      required_post_merge_checks: [],
      safety: {
        independent_review: true, exact_sha_evidence: true, vault_reconciliation: true, secret_scan: true,
        maximum_high_findings: 0, maximum_critical_findings: 0, compatibility: true, migrations: true,
        dependency_order: true, environment: true, recovery: true, human_approval: true, force_merge_allowed: false,
      },
      sources: [{ level: 'project', revision_id: 'policy-1', digest: 'c'.repeat(64), approved_at: '2026-08-30T14:00:00Z' }],
      resolved: true,
      missing: [],
      digest: 'd'.repeat(64),
    },
  }
}

describe('effective policy contract', () => {
  it('accepts a safe exact project/repository projection', () => {
    expect(normalizeEffectivePolicySnapshot(snapshot(), 'project-1', 'github://example/service')).toEqual(snapshot())
    expect(effectivePolicyModeLabel('merge')).toBe('Merge controlado')
  })

  it('fails closed on cross-project data, weakened floors or malformed evidence', () => {
    const crossProject = snapshot()
    crossProject.project_id = 'project-2'
    expect(normalizeEffectivePolicySnapshot(crossProject, 'project-1', 'github://example/service')).toBeNull()

    const weakened = snapshot()
    weakened.policy.safety.force_merge_allowed = true
    expect(normalizeEffectivePolicySnapshot(weakened, 'project-1', 'github://example/service')).toBeNull()

    const actorLeak = snapshot() as any
    actorLeak.policy.sources[0].approved_by = 'private-subject'
    expect(normalizeEffectivePolicySnapshot(actorLeak, 'project-1', 'github://example/service')).toBeNull()
  })
})
