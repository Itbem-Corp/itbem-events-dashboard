type CostGuardrail = { status?: string }
type RecentCostExecution = { completed_at?: string }

export type DeliveryCostRefreshSnapshot = {
  budget_watch?: readonly CostGuardrail[] | null
  task_budget_watch?: readonly CostGuardrail[] | null
  recent_executions?: readonly RecentCostExecution[] | null
}

/**
 * Cost data only needs a tight cadence while a fresh execution or a budget
 * signal can change an operator's next action. Idle portfolios remain current
 * without making every open costs tab poll at the live-flow rate.
 */
export function deliveryCostRefreshInterval(
  snapshot: DeliveryCostRefreshSnapshot | null | undefined,
  now = Date.now(),
) {
  if (!snapshot) return 15_000

  const guardrails = [...(snapshot.budget_watch ?? []), ...(snapshot.task_budget_watch ?? [])]
  if (guardrails.some((guardrail) => guardrail.status === 'attention' || guardrail.status === 'exceeded')) return 8_000

  const latestExecution = Math.max(
    0,
    ...(snapshot.recent_executions ?? []).map((execution) => Date.parse(execution.completed_at ?? '') || 0),
  )
  if (latestExecution > 0 && now - latestExecution < 120_000) return 10_000

  return 45_000
}
