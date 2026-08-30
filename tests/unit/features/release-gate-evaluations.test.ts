import {
  latestReleaseGateEvaluation,
  releaseGateReasonLabel,
  type ReleaseGateEvaluationSnapshot,
} from '@/features/automation/release-gate-evaluations'
import { describe, expect, it } from 'vitest'

const snapshot: ReleaseGateEvaluationSnapshot = {
  schema_version: 1,
  work_item_id: 'work-1',
  truncated: false,
  evaluations: [
    {
      event_id: 'event-1', sequence: 1, action: 'merge', change_set_id: 'change-1', state: 'blocked',
      reasons: [{ code: 'required_check_failed', repository: 'Example/api', evidence: 'ci' }], occurred_at: '2026-08-30T12:00:00Z',
    },
    {
      event_id: 'event-2', sequence: 2, action: 'merge', change_set_id: 'change-1', state: 'allowed',
      reasons: [], matrix_digest: 'a'.repeat(64), policy_digest: 'b'.repeat(64), vault_digest: 'c'.repeat(64), subject_digest: 'd'.repeat(64), occurred_at: '2026-08-30T12:01:00Z',
    },
  ],
}

describe('release Gatekeeper evaluation projection', () => {
  it('selects the highest valid sequence without trusting response order', () => {
    expect(latestReleaseGateEvaluation(snapshot, 'work-1')?.event_id).toBe('event-2')
  })

  it('fails closed for a foreign work item, schema drift, or malformed rows', () => {
    expect(latestReleaseGateEvaluation(snapshot, 'work-2')).toBeNull()
    expect(latestReleaseGateEvaluation({ ...snapshot, schema_version: 2 }, 'work-1')).toBeNull()
    expect(latestReleaseGateEvaluation({ ...snapshot, evaluations: [{ ...snapshot.evaluations[0], sequence: 0 }] }, 'work-1')).toBeNull()
    expect(latestReleaseGateEvaluation({ ...snapshot, evaluations: [{ ...snapshot.evaluations[1], vault_digest: undefined }] }, 'work-1')).toBeNull()
    expect(latestReleaseGateEvaluation({ ...snapshot, evaluations: [{ ...snapshot.evaluations[1], policy_digest: 'not-a-digest' }] }, 'work-1')).toBeNull()
  })

  it('turns stable reason codes into operator-facing evidence without hiding scope', () => {
    expect(releaseGateReasonLabel(snapshot.evaluations[0].reasons[0])).toBe(
      'Un check obligatorio falló. (Example/api · ci)',
    )
    expect(releaseGateReasonLabel({ code: 'future_gate' })).toBe('Bloqueo determinista: future_gate')
  })
})
