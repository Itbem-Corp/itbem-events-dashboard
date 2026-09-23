import { blockedReasonPresentation, deliveryContinuationNotice, hasCancellationRequest, hasUnresolvedOperationFailure, hasUnresolvedTaskFailure, unresolvedFailedTasks, unresolvedWorkflowFailures, workflowTasks } from '@/features/automation/delivery-task-status'
import { describe, expect, it } from 'vitest'

describe('delivery task status', () => {
  it('turns a durable file conflict into a safe operator instruction', () => {
    expect(blockedReasonPresentation('Conflicto de cambios en repo-a (src/app.ts) con otra rama del mismo DAG; reconcilia las ramas antes de continuar.')).toEqual({
      kind: 'conflict',
      title: 'Conflicto entre ramas',
      detail: 'Dos ramas del mismo trabajo declaran cambios sobre el mismo archivo. Revisa el alcance y reconcilia las ramas antes de continuar.',
      repository: 'repo-a',
      file: 'src/app.ts',
    })
  })

  it('keeps failed informational chat in the audit trail without treating it as a delivery failure', () => {
    const tasks = [
      { id: 'chat-1', operation: 'delivery.chat', status: 'failed', created_at: '2026-09-22T12:00:00Z' },
      { id: 'plan-1', operation: 'delivery.plan', status: 'completed', created_at: '2026-09-22T11:00:00Z' },
    ]

    expect(unresolvedFailedTasks(tasks)).toHaveLength(1)
    expect(workflowTasks(tasks)).toEqual([tasks[1]])
    expect(unresolvedWorkflowFailures(tasks)).toEqual([])
  })

  it('reports durable progress without claiming an absent worker is running', () => {
    expect(deliveryContinuationNotice({ agent_progress: 'queued' })).toContain('cola persistente')
    expect(deliveryContinuationNotice({ agent_progress: 'blocked', blocked_reason: 'Falta presupuesto' })).toBe('Falta presupuesto')
    expect(deliveryContinuationNotice({ agent_progress: 'waiting_for_preview' })).toContain('preview verificable')
    expect(deliveryContinuationNotice({})).toBeNull()
  })
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
