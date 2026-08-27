import { qaComparison } from '@/features/automation/delivery-evidence-gallery'
import { describe, expect, it } from 'vitest'

describe('QA evidence comparisons', () => {
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
})
