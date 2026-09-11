/**
 * Human gates may advance a delivery item, but they must never grant the
 * agent an unsafe capability.  This mapping contains only the phases that
 * can safely be queued immediately after their corresponding gate.  In
 * particular, publication stays excluded because it requires its own
 * short-lived, human-scoped publication grant.
 */
import type { DeliveryAutomationTask, DeliveryGate } from '@/features/automation/delivery-types'

const agentPhaseAfterTransition = {
  approve_plan: 'implementation',
  request_plan_changes: 'plan',
  request_code_changes: 'implementation',
  request_qa_changes: 'implementation',
  approve_qa: 'summary',
} as const

export type DeliveryAgentPhase =
  | 'plan'
  | 'implementation'
  | 'publish'
  | 'qa'
  | 'summary'

export function agentPhaseToQueueAfterTransition(action: string): DeliveryAgentPhase | undefined {
  return agentPhaseAfterTransition[action as keyof typeof agentPhaseAfterTransition]
}

export function deliveryOperationForAgentPhase(phase: DeliveryAgentPhase): string {
  return `delivery.${phase}`
}

function phaseAfterGate(gate: DeliveryGate): DeliveryAgentPhase | undefined {
  if (gate.kind === 'plan') return gate.decision === 'approved' ? 'implementation' : 'plan'
  if (gate.kind === 'code_review' && gate.decision === 'changes_requested') return 'implementation'
  if (gate.kind === 'qa_review') return gate.decision === 'approved' ? 'summary' : 'implementation'
  return undefined
}

/**
 * A browser may close between persisting a gate and receiving the enqueue
 * response.  Recover only when there is no task of the expected operation
 * created after the gate that requested it; historical completed tasks must
 * not hide that recovery path.
 */
export function needsAgentFollowUpRecovery(
  gates: readonly DeliveryGate[],
  tasks: readonly DeliveryAutomationTask[],
  phase: DeliveryAgentPhase,
): boolean {
  const gate = [...gates]
    .filter((candidate) => phaseAfterGate(candidate) === phase)
    .sort((left, right) => Date.parse(right.decided_at) - Date.parse(left.decided_at))[0]
  if (!gate) return false
  const gateTime = Date.parse(gate.decided_at)
  return !tasks.some(
    (task) => task.operation === deliveryOperationForAgentPhase(phase) && Date.parse(task.created_at) >= gateTime,
  )
}
