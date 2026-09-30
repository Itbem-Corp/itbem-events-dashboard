import { groupAutomationDispatchQueue, parseAutomationDispatchQueue, type AutomationDispatchQueueItem } from '@/features/automation/dispatch-queue'
import { describe, expect, it } from 'vitest'

const item: AutomationDispatchQueueItem = {
  assignment_id: 'assignment-1', execution_id: 'execution-1', step_id: 'step-1', step_key: 'implement_api',
  step_title: 'Implementar API', step_status: 'ready', assignment_status: 'queued', work_item_id: 'work-1',
  work_item_title: 'Panel de agentes', work_item_state: 'in_progress', project_id: 'project-1', project_name: 'Agent Studio',
  client_id: 'client-1', client_name: 'ITBEM', target_agent_key: 'backend-specialist', target_machine_id: 'machine-1',
  target_availability: 'available', target_concurrency: 3, target_active_runs: 1, target_available_slots: 2,
  target_last_seen_at: '2026-09-24T14:59:45Z',
  queued_at: '2026-09-24T15:00:00Z', dispatched_at: null, started_at: null, created_at: '2026-09-24T14:59:00Z', is_ready: true,
}

describe('automation dispatch queue contract', () => {
  it('accepts the versioned server read model and groups only by assigned agent and machine', () => {
    const page = parseAutomationDispatchQueue({
      schema_version: 1,
      generated_at: '2026-09-24T15:00:00Z',
      blocked_assignments: 2,
      expired_plan_step_leases: 1,
      items: [item, { ...item, assignment_id: 'assignment-2' }],
    })
    expect(page.items).toHaveLength(2)
    expect(page).toMatchObject({ blocked_assignments: 2, expired_plan_step_leases: 1 })
    expect(groupAutomationDispatchQueue(page.items)).toEqual([{ agentKey: 'backend-specialist', machineId: 'machine-1', items: page.items }])
  })

  it('accepts older API responses but rejects malformed server counters', () => {
    const page = parseAutomationDispatchQueue({ schema_version: 1, generated_at: item.created_at, items: [item] })
    expect(page.blocked_assignments).toBeUndefined()
    expect(() => parseAutomationDispatchQueue({ ...page, blocked_assignments: -1 })).toThrow(/no compatibles o no seguros/)
    expect(() => parseAutomationDispatchQueue({ ...page, expired_plan_step_leases: 1.5 })).toThrow(/no compatibles o no seguros/)
  })

  it('keeps unassigned destinations distinct and stable', () => {
    const groups = groupAutomationDispatchQueue([{ ...item, target_agent_key: null }, { ...item, assignment_id: 'assignment-2', target_agent_key: null }])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ agentKey: null, machineId: 'machine-1' })
    expect(groups[0].items).toHaveLength(2)
  })

  it('fails closed if private prompt, secret, or uncontracted payload fields appear', () => {
    const page = { schema_version: 1, generated_at: '2026-09-24T15:00:00Z', items: [item] }
    expect(() => parseAutomationDispatchQueue({ ...page, items: [{ ...item, prompt: 'private prompt' }] })).toThrow(/no compatibles o no seguros/)
    expect(() => parseAutomationDispatchQueue({ ...page, api_key: 'secret' })).toThrow(/no compatibles o no seguros/)
    expect(() => parseAutomationDispatchQueue({ ...page, next_cursor: '' })).toThrow(/no compatibles o no seguros/)
  })

  it('fails closed on unknown worker availability or invalid capacity values', () => {
    expect(() => parseAutomationDispatchQueue({ schema_version: 1, generated_at: item.created_at, items: [{ ...item, target_availability: 'maybe' }] })).toThrow(/no compatibles o no seguros/)
    expect(() => parseAutomationDispatchQueue({ schema_version: 1, generated_at: item.created_at, items: [{ ...item, target_available_slots: -1 }] })).toThrow(/no compatibles o no seguros/)
  })

  it.each(['unknown', 'offline', 'draining', 'no_capacity', 'saturated', 'working', 'available'])('accepts the documented worker availability vocabulary (%s)', (availability) => {
    const page = parseAutomationDispatchQueue({ schema_version: 1, generated_at: item.created_at, items: [{ ...item, target_availability: availability }] })
    expect(page.items[0].target_availability).toBe(availability)
  })
})
