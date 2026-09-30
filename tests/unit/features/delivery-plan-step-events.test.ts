import {
  deliveryPlanStepEventsPath,
  parseDeliveryPlanStepEvents,
  type DeliveryPlanStepEventsPage,
} from '@/features/automation/delivery-plan-step-events'
import { describe, expect, it } from 'vitest'

const expected = { planId: 'plan/1', planVersion: 4, stepId: 'step 2' }

const page: DeliveryPlanStepEventsPage = {
  plan_id: 'plan/1',
  plan_version: 4,
  step_id: 'step 2',
  items: [
    {
      id: 'event-1',
      event_type: 'step_started',
      from_status: 'ready',
      to_status: 'running',
      automation_task_id: 'task-1',
      run_id: 'run-1',
      agent_key: 'agent-1',
      machine_id: 'machine-1',
      agent_instance_id: 'f9e53a6f-9cda-4e84-88d4-bbac93addd11',
      summary: 'Paso iniciado.',
      occurred_at: '2026-09-23T10:00:00Z',
    },
  ],
  next_cursor: 'older + page',
}

describe('delivery plan step event API contract', () => {
  it('encodes plan, step, page size, and opaque cursor', () => {
    expect(deliveryPlanStepEventsPath(expected.planId, expected.stepId)).toBe(
      '/automation/plans/plan%2F1/steps/step%202/events?limit=25'
    )
    expect(deliveryPlanStepEventsPath(expected.planId, expected.stepId, page.next_cursor)).toBe(
      '/automation/plans/plan%2F1/steps/step%202/events?limit=25&cursor=older+%2B+page'
    )
  })

  it('accepts events only for the expected plan, version, and step', () => {
    expect(parseDeliveryPlanStepEvents(page, expected)).toEqual(page)
    expect(() => parseDeliveryPlanStepEvents({ ...page, plan_id: 'other' }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
    expect(() => parseDeliveryPlanStepEvents({ ...page, plan_version: 3 }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
    expect(() => parseDeliveryPlanStepEvents({ ...page, step_id: 'other' }, expected)).toThrow(
      'no corresponde a este plan y paso'
    )
  })

  it('rejects malformed items and invalid occurrence timestamps', () => {
    expect(() => parseDeliveryPlanStepEvents({ ...page, items: [{}] }, expected)).toThrow('formato esperado')
    expect(() =>
      parseDeliveryPlanStepEvents({ ...page, items: [{ ...page.items[0], occurred_at: 'yesterday' }] }, expected)
    ).toThrow('formato esperado')
    expect(() => parseDeliveryPlanStepEvents({ ...page, next_cursor: 123 }, expected)).toThrow('formato esperado')
  })

  it('accepts an optional opaque worker UUID and rejects a malformed identifier', () => {
    const workerId = 'f9e53a6f-9cda-4e84-88d4-bbac93addd11'
    const withWorker = { ...page, items: [{ ...page.items[0], worker_id: workerId }] }

    expect(parseDeliveryPlanStepEvents(withWorker, expected).items[0]?.worker_id).toBe(workerId)
    expect(parseDeliveryPlanStepEvents(page, expected).items[0]?.worker_id).toBeUndefined()
    expect(() =>
      parseDeliveryPlanStepEvents({ ...page, items: [{ ...page.items[0], worker_id: 'worker-mx-01' }] }, expected)
    ).toThrow('formato esperado')
  })

  it('accepts the authenticated agent instance UUID and rejects malformed or non-allowlisted fields', () => {
    expect(parseDeliveryPlanStepEvents(page, expected).items[0]?.agent_instance_id).toBe(
      'f9e53a6f-9cda-4e84-88d4-bbac93addd11'
    )
    expect(
      parseDeliveryPlanStepEvents({ ...page, items: [{ ...page.items[0], agent_instance_id: null }] }, expected)
        .items[0]?.agent_instance_id
    ).toBeNull()
    expect(() =>
      parseDeliveryPlanStepEvents({ ...page, items: [{ ...page.items[0], agent_instance_id: 'not-a-uuid' }] }, expected)
    ).toThrow('formato esperado')
    expect(() =>
      parseDeliveryPlanStepEvents(
        { ...page, items: [{ ...page.items[0], private_reasoning: 'must not leak' }] },
        expected
      )
    ).toThrow('formato esperado')
  })
})
