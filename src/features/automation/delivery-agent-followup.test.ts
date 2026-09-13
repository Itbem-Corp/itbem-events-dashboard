import { describe, expect, it } from 'vitest'

import { needsAgentFollowUpRecovery } from './delivery-agent-followup'

const approvedReadOnlyPlanGate = {
  id: 'gate-1',
  kind: 'plan' as const,
  decision: 'approved' as const,
  decided_by: 'operator',
  decided_at: '2026-09-12T10:00:00.000Z',
}

function assessmentTask(
  status: 'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'completed' | 'failed' | 'dispatch_failed',
  createdAt = '2026-09-12T10:01:00.000Z',
) {
  return {
    id: `task-${status}`,
    operation: 'delivery.assessment',
    status,
    created_at: createdAt,
  }
}

describe('needsAgentFollowUpRecovery', () => {
  it('recovers a read-only assessment when its latest attempt failed validation', () => {
    expect(needsAgentFollowUpRecovery(
      [approvedReadOnlyPlanGate],
      [assessmentTask('failed')],
      'assessment',
      true,
    )).toBe(true)
  })

  it('recovers when a later validation failure follows an earlier completed attempt', () => {
    expect(needsAgentFollowUpRecovery(
      [approvedReadOnlyPlanGate],
      [
        assessmentTask('completed'),
        assessmentTask('failed', '2026-09-12T10:02:00.000Z'),
      ],
      'assessment',
      true,
    )).toBe(true)
  })

  it.each(['queued', 'running', 'cancel_requested', 'completed'] as const)(
    'does not duplicate a viable %s assessment attempt',
    (status) => {
      expect(needsAgentFollowUpRecovery(
        [approvedReadOnlyPlanGate],
        [assessmentTask(status)],
        'assessment',
        true,
      )).toBe(false)
    },
  )
})
