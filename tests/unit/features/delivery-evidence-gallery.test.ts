import { evidenceIntegrityStatus, evidenceLineage, evidencePurposeLabel, qaComparison } from '@/features/automation/delivery-evidence-gallery'
import { deliveryEvidenceTitle } from '@/features/automation/delivery-evidence-presentation'
import { describe, expect, it } from 'vitest'

describe('QA evidence comparisons', () => {
  it('exposes bounded repository lineage without trusting arbitrary metadata', () => {
    expect(evidenceLineage({
      id: 'evidence', kind: 'screenshot', phase: 'qa', title: 'QA', reference: 's3://private',
      metadata: {
        repository_context_status: 'snapshot',
        repository_context: [
          { repository_ref: 'workspace://frontend', review_type: 'local_worktree', base_sha: 'a'.repeat(40), environment: 'local' },
          { repository_ref: '', review_type: 'ignored' },
          'ignored',
        ],
      },
    })).toEqual({
      status: 'snapshot',
      repositories: [{ repository: 'workspace://frontend', reviewType: 'local_worktree', revision: 'a'.repeat(40), environment: 'local' }],
    })
    expect(evidenceLineage({ id: 'legacy', kind: 'report', phase: 'qa', title: 'legacy', reference: 's3://private', metadata: { repository_context_status: 'unavailable' } })).toEqual({ status: 'unavailable', repositories: [] })
  })

  it('pairs only trusted Stagehand before/after metadata', () => {
    expect(qaComparison({
      id: 'before', kind: 'screenshot', phase: 'qa', title: 'Before', reference: 's3://private/before.png',
      metadata: { qa_comparison_key: 'case-01', qa_comparison_role: 'before' },
    })).toEqual({ key: 'case-01', role: 'before' })
    expect(qaComparison({
      id: 'after', kind: 'screenshot', phase: 'qa', title: 'After', reference: 's3://private/after.png',
      metadata: { qa_comparison_key: 'case-01', qa_comparison_role: 'after' },
    })).toEqual({ key: 'case-01', role: 'after' })
  })

  it('does not turn arbitrary artifact metadata into a comparison', () => {
    expect(qaComparison({
      id: 'unsafe', kind: 'screenshot', phase: 'qa', title: 'Unsafe', reference: 'https://outside.example/image.png',
      metadata: { qa_comparison_key: 'anything', qa_comparison_role: 'before' },
    })).toBeUndefined()
  })

  it('distinguishes verified, historical and invalid integrity metadata', () => {
    expect(evidenceIntegrityStatus({
      id: 'verified', kind: 'screenshot', phase: 'qa', title: 'Verified', reference: 's3://private/verified.png',
      metadata: { sha256: 'a'.repeat(64), size_bytes: 2048, automation_attempt: 2 },
    })).toMatchObject({ state: 'verified', digest: 'a'.repeat(64), size: 2048 })
    expect(evidenceIntegrityStatus({
      id: 'legacy', kind: 'report', phase: 'summary', title: 'Legacy', reference: 'https://example.test/report', metadata: {},
    })).toMatchObject({ state: 'legacy', digest: '' })
    expect(evidenceIntegrityStatus({
      id: 'invalid', kind: 'artifact', phase: 'qa', title: 'Invalid', reference: 's3://private/invalid.json', metadata: { sha256: 'not-a-digest' },
    })).toMatchObject({ state: 'invalid', digest: '' })
  })

  it('does not label a planning artifact as executed proof', () => {
    expect(evidencePurposeLabel({ id: 'plan', kind: 'artifact', phase: 'plan', title: 'Plan result', reference: 'private://plan' }))
      .toBe('Plan propuesto · no es prueba de ejecución')
    expect(evidencePurposeLabel({ id: 'test', kind: 'test_result', phase: 'qa', title: 'QA', reference: 'private://test' }))
      .toBe('Resultado de prueba registrado')
  })

  it('presents internal plan-artifact names as a human-readable title', () => {
    expect(deliveryEvidenceTitle({ id: 'plan', kind: 'report', phase: 'plan', title: 'Resultado del agente: plan', reference: 'private://plan' }))
      .toBe('Propuesta de plan')
    expect(deliveryEvidenceTitle({ id: 'qa', kind: 'test_result', phase: 'qa', title: 'QA local · 1208 pruebas', reference: 'private://qa' }))
      .toBe('QA local · 1208 pruebas')
  })
})
