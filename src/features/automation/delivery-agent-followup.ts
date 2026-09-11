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
  | 'assessment'
  | 'publish'
  | 'qa'
  | 'summary'

type RepositoryImpact = {
  name: string
  reference: string
  revision: string
  role: 'primary' | 'supporting'
  impact: 'changes' | 'consulted' | 'untouched'
  notes: string
}

// Plans are stored as JSON text, but the authenticated API may return a
// decoded structured result. Only a complete zero-change matrix may enter the
// assessment lane; every malformed or partial value remains fail-closed.
export function isReadOnlyAssessmentPlan(value: unknown): boolean {
  let plan: Record<string, unknown>
  try {
    plan = typeof value === 'string'
      ? JSON.parse(value) as Record<string, unknown>
      : value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
  } catch {
    return false
  }
  const entries = plan.repository_impact
  if (!Array.isArray(entries) || entries.length === 0) return false
  return entries.every((entry): entry is RepositoryImpact => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<RepositoryImpact>
    return typeof candidate.name === 'string' && typeof candidate.reference === 'string' &&
      typeof candidate.revision === 'string' &&
      (candidate.role === 'primary' || candidate.role === 'supporting') &&
      (candidate.impact === 'changes' || candidate.impact === 'consulted' || candidate.impact === 'untouched') &&
      typeof candidate.notes === 'string' && candidate.impact !== 'changes'
  })
}

export function agentPhaseToQueueAfterTransition(action: string, readOnlyAssessment = false): DeliveryAgentPhase | undefined {
  if (action === 'approve_plan' && readOnlyAssessment) return 'assessment'
  return agentPhaseAfterTransition[action as keyof typeof agentPhaseAfterTransition]
}

export function deliveryOperationForAgentPhase(phase: DeliveryAgentPhase): string {
  return `delivery.${phase}`
}

function phaseAfterGate(gate: DeliveryGate, readOnlyAssessment: boolean): DeliveryAgentPhase | undefined {
  if (gate.kind === 'plan') return gate.decision === 'approved' ? (readOnlyAssessment ? 'assessment' : 'implementation') : 'plan'
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
  readOnlyAssessment = false,
): boolean {
  const gate = [...gates]
    .filter((candidate) => phaseAfterGate(candidate, readOnlyAssessment) === phase)
    .sort((left, right) => Date.parse(right.decided_at) - Date.parse(left.decided_at))[0]
  if (!gate) return false
  const gateTime = Date.parse(gate.decided_at)
  return !tasks.some(
    (task) => task.operation === deliveryOperationForAgentPhase(phase) && Date.parse(task.created_at) >= gateTime,
  )
}
