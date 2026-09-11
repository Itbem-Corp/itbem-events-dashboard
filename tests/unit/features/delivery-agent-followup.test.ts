import {
  agentPhaseToQueueAfterTransition,
  deliveryOperationForAgentPhase,
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
})
