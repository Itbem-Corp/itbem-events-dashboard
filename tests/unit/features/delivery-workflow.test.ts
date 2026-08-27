import { humanTransitionAwaitsAgentResult } from '@/features/automation/delivery-workflow'
import { describe, expect, it } from 'vitest'

describe('delivery workflow submission availability', () => {
  it.each([
    ['submit_plan', 'delivery.plan'],
    ['submit_code_review', 'delivery.implementation'],
    ['submit_qa', 'delivery.qa'],
    ['approve_release', 'delivery.summary'],
  ])('waits for the matching %s result', (action, operation) => {
    expect(humanTransitionAwaitsAgentResult(action, new Set())).toBe(true)
    expect(humanTransitionAwaitsAgentResult(action, new Set([operation]))).toBe(false)
  })

  it('does not block a human-only gate', () => {
    expect(humanTransitionAwaitsAgentResult('approve_plan', new Set())).toBe(false)
  })
})
