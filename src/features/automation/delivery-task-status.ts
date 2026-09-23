type AutomationTaskState = {
  operation: string
  status: string
  created_at: string
  completed_at?: string
}

export type BlockedReasonPresentation = {
  kind: 'conflict' | 'generic'
  title: string
  detail: string
  repository?: string
  file?: string
}

/**
 * Turns a durable blocking reason into operator language without making the
 * UI responsible for deciding whether a conflict is safe to merge. The
 * backend remains the source of truth for the block and its resolution.
 */
export function blockedReasonPresentation(reason?: string): BlockedReasonPresentation {
  const value = reason?.trim() ?? ''
  const match = value.match(/^Conflicto de cambios en (.+?) \((.+?)\) con otra rama/i)
  if (match) {
    return {
      kind: 'conflict',
      title: 'Conflicto entre ramas',
      detail: 'Dos ramas del mismo trabajo declaran cambios sobre el mismo archivo. Revisa el alcance y reconcilia las ramas antes de continuar.',
      repository: match[1],
      file: match[2],
    }
  }
  return {
    kind: 'generic',
    title: 'Necesita atención',
    detail: value || 'El agente necesita atención antes de continuar.',
  }
}

export function deliveryContinuationNotice(item: { agent_progress?: string; blocked_reason?: string }) {
  switch (item.agent_progress) {
    case 'blocked': return item.blocked_reason || 'El agente necesita atención antes de continuar.'
    case 'waiting_for_preview': return item.blocked_reason || 'Esperando publicación autorizada y un preview verificable de CI.'
    case 'queued': return 'Siguiente paso guardado en la cola persistente. No necesitas mantener esta página abierta.'
    case 'waiting_for_user': return 'El resultado está listo para una decisión humana.'
    default: return null
  }
}

export function taskActivityTime(task: AutomationTaskState) {
  const value = Date.parse(task.completed_at ?? task.created_at)
  return Number.isNaN(value) ? 0 : value
}

/**
 * A failed attempt remains part of the audit trail, but it should only block
 * the product when it is the newest attempt for that delivery operation.
 */
export function latestTaskByOperation<T extends AutomationTaskState>(tasks: readonly T[]) {
  const latest = new Map<string, T>()
  for (const task of tasks) {
    const current = latest.get(task.operation)
    if (!current || taskActivityTime(task) >= taskActivityTime(current)) latest.set(task.operation, task)
  }
  return [...latest.values()]
}

/**
 * Conversation is durable and auditable, but it is not a delivery stage.
 * A question must never make the plan, implementation, or a human gate look
 * unhealthy. Keep these records visible in activity while excluding them from
 * the flow-health projection.
 */
export function workflowTasks<T extends AutomationTaskState>(tasks: readonly T[]) {
  return tasks.filter((task) => task.operation !== 'delivery.chat')
}

export function unresolvedFailedTasks<T extends AutomationTaskState>(tasks: readonly T[]) {
  return latestTaskByOperation(tasks).filter(
    (task) => task.status === 'failed' || task.status === 'dispatch_failed',
  )
}

export function unresolvedWorkflowFailures<T extends AutomationTaskState>(tasks: readonly T[]) {
  return unresolvedFailedTasks(workflowTasks(tasks))
}

export function hasUnresolvedTaskFailure(tasks: readonly AutomationTaskState[]) {
  return unresolvedFailedTasks(tasks).length > 0
}

/**
 * A cancellation request is an operator intent, not a background detail.
 * Surfaces should prefer it over queued or running attempts when describing
 * the current state of a delivery flow.
 */
export function hasCancellationRequest(tasks: readonly AutomationTaskState[]) {
  return tasks.some((task) => task.status === 'cancel_requested')
}

export function hasUnresolvedOperationFailure(tasks: readonly AutomationTaskState[], operation: string) {
  return unresolvedFailedTasks(tasks).some((task) => task.operation === operation)
}
