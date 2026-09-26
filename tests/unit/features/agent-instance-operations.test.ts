import {
  AUTOMATION_AGENT_HEARTBEAT_STALE_AFTER_MS,
  automationAgentInstanceOperationalView,
} from '@/features/automation/agent-directory'
import type { AutomationAgentInstance } from '@/features/automation/agent-directory'
import { describe, expect, it } from 'vitest'

function instance(overrides: Partial<AutomationAgentInstance> = {}): AutomationAgentInstance {
  return {
    worker_id: 'worker-1',
    machine_id: 'machine-1',
    status: 'working',
    provider: 'openrouter',
    model: 'small-model',
    concurrency: 2,
    draining: false,
    started_at: '2026-09-24T10:00:00.000Z',
    last_seen_at: '2026-09-24T10:00:30.000Z',
    active_runs: [{ task_id: 'task-1', run_id: 'run-1', operation: 'delivery.qa', status: 'running' }],
    ...overrides,
  }
}

describe('agent instance operational view', () => {
  const generatedAt = '2026-09-24T10:01:00.000Z'

  it('derives fresh liveness and free slots from the directory snapshot only', () => {
    const view = automationAgentInstanceOperationalView(instance(), generatedAt)

    expect(view).toMatchObject({
      liveness: 'live',
      heartbeatAgeMs: 30_000,
      reportedActiveRuns: 1,
      concurrency: 2,
      unoccupiedCapacity: 1,
      effectiveAvailableSlots: 1,
      availability: 'available',
    })
  })

  it('uses the backend 90-second cutoff exactly and never counts stale capacity as available', () => {
    const staleGeneratedAt = new Date(Date.parse(generatedAt) + AUTOMATION_AGENT_HEARTBEAT_STALE_AFTER_MS - 30_000).toISOString()
    const view = automationAgentInstanceOperationalView(instance(), staleGeneratedAt)

    expect(view.liveness).toBe('stale')
    expect(view.availability).toBe('offline')
    expect(view.unoccupiedCapacity).toBe(1)
    expect(view.effectiveAvailableSlots).toBe(0)
  })

  it('treats draining, zero-capacity, and saturated workers as unable to accept new work', () => {
    expect(automationAgentInstanceOperationalView(instance({ draining: true, status: 'draining' }), generatedAt)).toMatchObject({
      availability: 'draining', effectiveAvailableSlots: 0,
    })
    expect(automationAgentInstanceOperationalView(instance({ concurrency: 0, active_runs: [] }), generatedAt)).toMatchObject({
      availability: 'no_capacity', effectiveAvailableSlots: 0,
    })
    expect(automationAgentInstanceOperationalView(instance({ concurrency: 1 }), generatedAt)).toMatchObject({
      availability: 'saturated', reportedActiveRuns: 1, effectiveAvailableSlots: 0,
    })
  })

  it('does not invent liveness when timestamps are malformed or disagree with the snapshot clock', () => {
    expect(automationAgentInstanceOperationalView(instance({ last_seen_at: 'not-a-date' }), generatedAt)).toMatchObject({
      liveness: 'unknown', heartbeatAgeMs: null, availability: 'unknown', effectiveAvailableSlots: 0,
    })
    expect(automationAgentInstanceOperationalView(instance({ last_seen_at: '2026-09-24T10:02:00.000Z' }), generatedAt)).toMatchObject({
      liveness: 'unknown', heartbeatAgeMs: null, availability: 'unknown', effectiveAvailableSlots: 0,
    })
  })
})
