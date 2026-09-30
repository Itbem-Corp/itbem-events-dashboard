import type { DeliveryEvidence } from './delivery-types'

/** A case name is reused between QA attempts; it is not a comparison identity. */
export function evidenceComparisonScope(entry: DeliveryEvidence): string | undefined {
  const metadata = entry.metadata
  const task = metadata?.automation_task_id
  const key = metadata?.qa_comparison_key
  const role = metadata?.qa_comparison_role
  if (entry.kind !== 'screenshot' || entry.phase !== 'qa' || !entry.reference.startsWith('s3://') ||
    typeof task !== 'string' || !task.trim() || typeof key !== 'string' || !/^case-\d{1,3}$/.test(key) ||
    (role !== 'before' && role !== 'after')) return undefined
  return JSON.stringify([task, key])
}
