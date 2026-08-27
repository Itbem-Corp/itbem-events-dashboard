type AutomationTaskState = {
  operation: string
  status: string
  created_at: string
  completed_at?: string
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

export function unresolvedFailedTasks<T extends AutomationTaskState>(tasks: readonly T[]) {
  return latestTaskByOperation(tasks).filter(
    (task) => task.status === 'failed' || task.status === 'dispatch_failed',
  )
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
