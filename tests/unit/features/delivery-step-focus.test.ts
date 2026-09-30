import { deliveryStepFocusReturnQuery, readDeliveryStepFocusRequest, resolveDeliveryStepFocus } from '@/features/automation/delivery-step-focus'
import type { DeliveryPlanStep } from '@/features/automation/delivery-plan-steps'
import { describe, expect, it } from 'vitest'

const steps: DeliveryPlanStep[] = [
  {
    id: 'step-build', plan_id: 'plan-1', plan_version: 4, step_key: 'build-api', order: 0,
    title: 'Construir API', objective: '', acceptance_criteria: [], depends_on: [], status: 'running',
    created_at: '2026-09-24T10:00:00Z', updated_at: '2026-09-24T10:01:00Z',
  },
]

describe('agent step deep-link contract', () => {
  it('does not create a focus request when the step query is missing', () => {
    expect(readDeliveryStepFocusRequest(new URLSearchParams('view=activity&run=run-1'))).toBeNull()
    expect(readDeliveryStepFocusRequest(new URLSearchParams('view=overview&step='))).toBeNull()
  })

  it('resolves only an exact step_key from the loaded plan and rejects ambiguous keys', () => {
    expect(resolveDeliveryStepFocus('build-api', steps)).toEqual({
      status: 'matched', stepKey: 'build-api', stepId: 'step-build', title: 'Construir API',
    })
    expect(resolveDeliveryStepFocus('Build-API', steps)).toEqual({ status: 'not_found', stepKey: 'Build-API' })
    expect(resolveDeliveryStepFocus('build-api', [steps[0], { ...steps[0], id: 'step-build-duplicate' }])).toEqual({
      status: 'ambiguous', stepKey: 'build-api',
    })
  })

  it('cleans resolved step/run keys, preserves unrelated context, and selects the resulting view', () => {
    const query = deliveryStepFocusReturnQuery(new URLSearchParams('step=build-api&run=run-1&from_project=project-7'), 'overview')
    const params = new URLSearchParams(query)
    expect(params.get('step')).toBeNull()
    expect(params.get('run')).toBeNull()
    expect(params.get('from_project')).toBe('project-7')
    expect(params.get('view')).toBe('overview')

    const fallback = new URLSearchParams(deliveryStepFocusReturnQuery(new URLSearchParams('step=missing&run=run-2&tab=activity'), 'activity'))
    expect(fallback.get('step')).toBeNull()
    expect(fallback.get('run')).toBeNull()
    expect(fallback.get('tab')).toBe('activity')
    expect(fallback.get('view')).toBe('activity')
  })
})
