import {
  agentPhaseToQueueAfterTransition,
  deliveryOperationForAgentPhase,
  isReadOnlyAssessmentPlan,
  needsAgentFollowUpRecovery,
} from '@/features/automation/delivery-agent-followup'
import { describe, expect, it } from 'vitest'

describe('delivery agent follow-ups', () => {
  it.each([
    ['approve_plan', 'implementation'],
    ['request_plan_changes', 'plan'],
    ['request_code_changes', 'implementation'],
    ['request_qa_changes', 'implementation'],
    ['approve_qa', 'summary'],
  ])('queues the safe follow-up for %s', (action, phase) => {
    expect(agentPhaseToQueueAfterTransition(action)).toBe(phase)
  })

  it('does not auto-queue publication or any terminal/human-only action', () => {
    expect(agentPhaseToQueueAfterTransition('approve_code_review')).toBeUndefined()
    expect(agentPhaseToQueueAfterTransition('approve_release')).toBeUndefined()
    expect(agentPhaseToQueueAfterTransition('block')).toBeUndefined()
  })

  it('routes an explicitly read-only approved plan to assessment, not implementation', () => {
    expect(agentPhaseToQueueAfterTransition('approve_plan', true)).toBe('assessment')
    expect(deliveryOperationForAgentPhase('assessment')).toBe('delivery.assessment')
  })

  it('accepts either API representation only for a complete zero-change matrix', () => {
    const plan = { repository_impact: [{ name: 'Backend', reference: 'github://example/backend', revision: 'a'.repeat(40), role: 'primary', impact: 'consulted', notes: 'No change required.' }] }
    expect(isReadOnlyAssessmentPlan(plan)).toBe(true)
    expect(isReadOnlyAssessmentPlan(JSON.stringify(plan))).toBe(true)
    expect(isReadOnlyAssessmentPlan({ repository_impact: [{ ...plan.repository_impact[0], impact: 'changes' }] })).toBe(false)
    expect(isReadOnlyAssessmentPlan({ repository_impact: [{ reference: 'github://missing-fields', impact: 'consulted' }] })).toBe(false)
  })

  it('uses the API operation naming for a recovery check', () => {
    expect(deliveryOperationForAgentPhase('implementation')).toBe('delivery.implementation')
  })

  it('offers recovery only when the gate has no later matching task', () => {
    const gate = {
      id: 'gate-1',
      kind: 'plan' as const,
      decision: 'approved' as const,
      decided_by: 'human',
      decided_at: '2026-09-11T12:00:00.000Z',
    }
    expect(needsAgentFollowUpRecovery([gate], [], 'implementation')).toBe(true)
    expect(
      needsAgentFollowUpRecovery(
        [gate],
        [{ id: 'task-1', operation: 'delivery.implementation', status: 'queued', created_at: '2026-09-11T12:00:01.000Z' }],
        'implementation',
      ),
    ).toBe(false)
  })

  it('does not mistake a historical implementation for a new code-change follow-up', () => {
    const gate = {
      id: 'gate-2',
      kind: 'code_review' as const,
      decision: 'changes_requested' as const,
      decided_by: 'human',
      decided_at: '2026-09-11T13:00:00.000Z',
    }
    expect(
      needsAgentFollowUpRecovery(
        [gate],
        [{ id: 'old-task', operation: 'delivery.implementation', status: 'completed', created_at: '2026-09-11T12:00:00.000Z' }],
        'implementation',
      ),
    ).toBe(true)
  })

  it('recovers a read-only plan only when its assessment is absent', () => {
    const gate = {
      id: 'gate-assessment',
      kind: 'plan' as const,
      decision: 'approved' as const,
      decided_by: 'human',
      decided_at: '2026-09-11T14:00:00.000Z',
    }
    expect(needsAgentFollowUpRecovery([gate], [], 'assessment', true)).toBe(true)
    expect(needsAgentFollowUpRecovery(
      [gate],
      [{ id: 'assessment-task', operation: 'delivery.assessment', status: 'completed', created_at: '2026-09-11T14:01:00.000Z' }],
      'assessment',
      true,
    )).toBe(false)
  })
})
