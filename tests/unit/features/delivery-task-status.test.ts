import { hasCancellationRequest, hasUnresolvedOperationFailure, hasUnresolvedTaskFailure, unresolvedFailedTasks } from '@/features/automation/delivery-task-status'
import { describe, expect, it } from 'vitest'

describe('delivery task status', () => {
  it('clears a prior failure when a later attempt for the same operation succeeds', () => {
    const tasks = [
      { operation: 'delivery.plan', status: 'failed', created_at: '2026-08-11T10:00:00.000Z' },
      { operation: 'delivery.plan', status: 'completed', created_at: '2026-08-11T10:02:00.000Z' },
    ]

    expect(unresolvedFailedTasks(tasks)).toEqual([])
    expect(hasUnresolvedTaskFailure(tasks)).toBe(false)
    expect(hasUnresolvedOperationFailure(tasks, 'delivery.plan')).toBe(false)
  })

  it('keeps a failure open when it is the newest attempt for its operation', () => {
    const tasks = [
      { operation: 'delivery.plan', status: 'completed', created_at: '2026-08-11T10:00:00.000Z' },
      { operation: 'delivery.plan', status: 'failed', created_at: '2026-08-11T10:02:00.000Z' },
      { operation: 'delivery.qa', status: 'completed', created_at: '2026-08-11T10:03:00.000Z' },
    ]

    expect(unresolvedFailedTasks(tasks)).toHaveLength(1)
    expect(hasUnresolvedTaskFailure(tasks)).toBe(true)
    expect(hasUnresolvedOperationFailure(tasks, 'delivery.plan')).toBe(true)
    expect(hasUnresolvedOperationFailure(tasks, 'delivery.qa')).toBe(false)
  })

  it('treats a cancellation request as the current operator intent', () => {
    const tasks = [
      { operation: 'delivery.plan', status: 'queued', created_at: '2026-08-11T10:00:00.000Z' },
      { operation: 'delivery.qa', status: 'cancel_requested', created_at: '2026-08-11T10:02:00.000Z' },
    ]

    expect(hasCancellationRequest(tasks)).toBe(true)
    expect(hasCancellationRequest([{ operation: 'delivery.plan', status: 'running', created_at: '2026-08-11T10:00:00.000Z' }])).toBe(false)
  })
})
