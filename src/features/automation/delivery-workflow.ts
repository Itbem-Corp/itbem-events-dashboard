/**
 * Maps the human submission actions to the immutable agent result that must
 * already exist. The API enforces the same rule; keeping this small mapping in
 * the UI makes the disabled state explainable instead of relying on a 409.
 */
export const requiredDeliveryOperationByAction = {
  submit_plan: 'delivery.plan',
  submit_code_review: 'delivery.implementation',
  submit_qa: 'delivery.qa',
  approve_release: 'delivery.summary',
} as const

export function humanTransitionAwaitsAgentResult(action: string, completedOperations: ReadonlySet<string>) {
  const operation = requiredDeliveryOperationByAction[action as keyof typeof requiredDeliveryOperationByAction]
  return Boolean(operation && !completedOperations.has(operation))
}
