import type { DeliveryPlanStep } from './delivery-plan-steps'

export type DeliveryStepFocusResolution =
  | { status: 'matched'; stepKey: string; stepId: string; title: string }
  | { status: 'not_found' | 'ambiguous'; stepKey: string }

export type DeliveryStepFocusRequest = { stepKey: string; runId?: string }

export function readDeliveryStepFocusRequest(params: URLSearchParams): DeliveryStepFocusRequest | null {
  const stepKey = params.get('step')
  if (!stepKey) return null
  const runId = params.get('run')
  return { stepKey, ...(runId ? { runId } : {}) }
}

/** Remove one-shot focus parameters while preserving unrelated deep-link context. */
export function deliveryStepFocusReturnQuery(params: URLSearchParams, view: 'overview' | 'activity'): string {
  const next = new URLSearchParams(params.toString())
  next.delete('step')
  next.delete('run')
  next.set('view', view)
  return next.toString()
}

/** Resolve an agent-reported key only when it uniquely names a step in this plan. */
export function resolveDeliveryStepFocus(stepKey: string, steps: readonly DeliveryPlanStep[]): DeliveryStepFocusResolution {
  const matches = steps.filter((step) => step.step_key === stepKey)
  if (matches.length === 1) {
    return { status: 'matched', stepKey, stepId: matches[0].id, title: matches[0].title }
  }
  return { status: matches.length > 1 ? 'ambiguous' : 'not_found', stepKey }
}
