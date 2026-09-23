import { describe, expect, it } from 'vitest'
import { evidenceComparisonScope } from '@/features/automation/evidence-comparison'
import type { DeliveryEvidence } from '@/features/automation/delivery-types'

const evidence: DeliveryEvidence = { id: 'a', kind: 'screenshot', phase: 'qa', title: 'Antes', reference: 's3://private/a.png', metadata: { automation_task_id: 'run1', qa_comparison_key: 'case-01', qa_comparison_role: 'before' } }
describe('evidence comparison identity', () => {
  it('never combines two different QA attempts', () => {
    expect(evidenceComparisonScope(evidence)).not.toEqual(evidenceComparisonScope({ ...evidence, metadata: { ...evidence.metadata, automation_task_id: 'run2' } }))
  })
  it('keeps unscoped legacy evidence visible without inventing a pair', () => {
    expect(evidenceComparisonScope({ ...evidence, metadata: { ...evidence.metadata, automation_task_id: undefined } })).toBeUndefined()
  })
  it('pairs the two roles within the same attempt', () => {
    expect(evidenceComparisonScope(evidence)).toEqual(evidenceComparisonScope({ ...evidence, metadata: { ...evidence.metadata, qa_comparison_role: 'after' } }))
  })
})
