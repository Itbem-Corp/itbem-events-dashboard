import {
  automationAgentPlanStepProtocolState,
  parseAutomationAgentDirectory,
  parseAutomationAgentHistory,
  type AutomationAgentDirectorySnapshot,
} from '@/features/automation/agent-directory'
import { describe, expect, it } from 'vitest'

const contractMock: AutomationAgentDirectorySnapshot = {
  schema_version: 1,
  generated_at: '2026-09-23T18:20:00Z',
  summary: {
    profile_count: 1,
    live_instances: 1,
    active_runs: 1,
    available_slots: 2,
    queued_tasks: 3,
    spend_30d_microusd: 42_000,
  },
  agents: [
    {
      agent_key: 'frontend-specialist',
      name: 'Ada',
      specialty: 'Frontend',
      description: 'Implementa interfaces accesibles.',
      capabilities: ['react', 'testing'],
      status: 'working',
      instance_count: 1,
      active_run_count: 1,
      total_runs_30d: 12,
      spend_30d_microusd: 42_000,
      instances: [
        {
          worker_id: 'worker-a',
          machine_id: 'equipo-mex-01',
          protocols: ['delivery.plan_steps.v1'],
          status: 'working',
          provider: 'openrouter',
          model: 'small-model',
          concurrency: 2,
          draining: false,
          started_at: '2026-09-22T10:00:00Z',
          last_seen_at: '2026-09-23T18:19:55Z',
          active_runs: [
            {
              task_id: 'task-1',
              run_id: 'run-1',
              operation: 'delivery.implementation',
              status: 'running',
              client_id: 'client-1',
              client_name: 'ITBEM',
              project_id: 'project-1',
              project_name: 'Agent Studio',
              epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
              epic_title: 'Consola de agentes',
              work_item_id: 'work-1',
              work_item_title: 'Roster visual',
              step_key: 'build',
              started_at: '2026-09-23T18:00:00Z',
            },
          ],
        },
      ],
    },
  ],
  queue_lanes: [{ operation: 'delivery.qa', queued_tasks: 3, oldest_queued_at: '2026-09-23T17:00:00Z' }],
}

describe('Automation agent directory v1 contract', () => {
  it('accepts the documented response shape and preserves instance assignment context', () => {
    const parsed = parseAutomationAgentDirectory(contractMock)

    expect(parsed).toEqual(contractMock)
    expect(parsed.agents[0].instances[0].active_runs[0]).toMatchObject({
      client_name: 'ITBEM',
      project_name: 'Agent Studio',
      epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      epic_title: 'Consola de agentes',
      work_item_title: 'Roster visual',
      step_key: 'build',
    })
    expect(automationAgentPlanStepProtocolState(parsed.agents[0].instances[0].protocols)).toBe('supported')
  })

  it('keeps older v1 snapshots compatible and distinguishes missing protocol data from an explicit legacy list', () => {
    const instanceWithoutProtocols = { ...contractMock.agents[0].instances[0] }
    Reflect.deleteProperty(instanceWithoutProtocols, 'protocols')
    const olderSnapshot = {
      ...contractMock,
      agents: [{ ...contractMock.agents[0], instances: [instanceWithoutProtocols] }],
    }
    const parsed = parseAutomationAgentDirectory(olderSnapshot)

    expect(parsed.agents[0].instances[0].protocols).toBeUndefined()
    expect(automationAgentPlanStepProtocolState(parsed.agents[0].instances[0].protocols)).toBe('unknown')
    expect(automationAgentPlanStepProtocolState([])).toBe('legacy')
    expect(automationAgentPlanStepProtocolState(['delivery.plan_steps.v1'])).toBe('supported')
    expect(() => parseAutomationAgentDirectory({
      ...contractMock,
      agents: [{
        ...contractMock.agents[0],
        instances: [{ ...contractMock.agents[0].instances[0], protocols: ['delivery.plan_steps.v1', 42] }],
      }],
    })).toThrow(/instancias incompletos/)
  })

  it('rejects an unknown schema version rather than showing an incompatible snapshot', () => {
    expect(() => parseAutomationAgentDirectory({ ...contractMock, schema_version: 2 })).toThrow(/versión de contrato/)
  })

  it('keeps earlier v1 directory and history payloads without epic fields compatible', () => {
    const legacyRun = { ...contractMock.agents[0].instances[0].active_runs[0] }
    Reflect.deleteProperty(legacyRun, 'epic_id')
    Reflect.deleteProperty(legacyRun, 'epic_title')
    const legacyDirectory = {
      ...contractMock,
      agents: [{
        ...contractMock.agents[0],
        instances: [{ ...contractMock.agents[0].instances[0], active_runs: [legacyRun] }],
      }],
    }
    const oldRun = parseAutomationAgentDirectory(legacyDirectory).agents[0].instances[0].active_runs[0]
    expect(oldRun.epic_id).toBeUndefined()
    expect(oldRun.epic_title).toBeUndefined()

    const oldHistory = parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [{
        id: 'legacy-activity',
        kind: 'step_activity',
        occurred_at: '2026-09-24T18:20:00Z',
        activity_action: 'evidence',
        project_id: 'project-1',
        work_item_id: 'work-1',
      }],
      limit: 50,
      has_more: false,
    })
    expect(oldHistory.items[0].epic_id).toBeUndefined()
    expect(oldHistory.items[0].epic_title).toBeUndefined()
  })

  it('rejects malformed queue lanes instead of inferring an agent assignment', () => {
    expect(() =>
      parseAutomationAgentDirectory({ ...contractMock, queue_lanes: [{ operation: 'delivery.qa' }] })
    ).toThrow(/carriles de cola/)
  })

  it('accepts allow-listed step activity without requiring private tool payloads', () => {
    const parsed = parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [
        {
          id: 'activity-1',
          kind: 'step_activity',
          occurred_at: '2026-09-24T18:20:00Z',
          task_id: 'task-1',
          run_id: 'run-1',
          worker_id: '11111111-2222-4333-8444-555555555555',
          machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
          operation: 'delivery.implementation',
          status: 'completed',
          project_id: 'project-1',
          work_item_id: 'work-1',
          epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          epic_title: 'Consola de agentes',
          step_key: 'build',
          activity_action: 'file_change',
          summary: 'Plan step activity',
        },
      ],
      limit: 50,
      has_more: false,
    })

    expect(parsed.items[0]).toMatchObject({
      kind: 'step_activity',
      activity_action: 'file_change',
      status: 'completed',
      worker_id: '11111111-2222-4333-8444-555555555555',
      machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
      epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      epic_title: 'Consola de agentes',
    })
    expect(() =>
      parseAutomationAgentHistory({
        agent_key: 'frontend-specialist',
        items: [
          {
            id: 'activity-2',
            kind: 'step_activity',
            occurred_at: '2026-09-24T18:20:00Z',
            activity_action: 'run_shell',
          },
        ],
        limit: 50,
        has_more: false,
      })
    ).toThrow(/historial de agente incompleto/)
  })

  it('accepts allow-listed task lifecycle events with safe identity transitions', () => {
    const event = {
      id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      kind: 'task_event',
      occurred_at: '2026-09-24T18:20:00Z',
      task_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      event_type: 'lease_reclaimed',
      previous_status: 'running',
      status: 'running',
      attempt_count: 2,
      event_sequence: 7,
      current_agent_key: 'frontend-specialist',
      previous_run_id: 'run-old',
      run_id: 'run-new',
      previous_worker_id: '11111111-2222-4333-8444-555555555555',
      worker_id: '22222222-3333-4444-8555-666666666666',
      previous_machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      previous_agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
      agent_instance_id: 'dddddddd-eeee-4fff-8000-000000000002',
      previous_agent_key: 'worker-old',
    }
    const parsed = parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [event],
      limit: 50,
      has_more: false,
    })

    expect(parsed.items[0]).toMatchObject(event)
    expect(() => parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [{ ...event, event_type: 'prompt_dump' }],
      limit: 50,
      has_more: false,
    })).toThrow(/historial de agente incompleto/)
    expect(() => parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [{ ...event, previous_agent_instance_id: 'not-a-uuid' }],
      limit: 50,
      has_more: false,
    })).toThrow(/historial de agente incompleto/)
    expect(() => parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [{ ...event, event_sequence: 0 }],
      limit: 50,
      has_more: false,
    })).toThrow(/historial de agente incompleto/)
  })

  it('rejects malformed epic identifiers instead of creating an unsafe hierarchy link', () => {
    expect(() => parseAutomationAgentDirectory({
      ...contractMock,
      agents: [{
        ...contractMock.agents[0],
        instances: [{
          ...contractMock.agents[0].instances[0],
          active_runs: [{ ...contractMock.agents[0].instances[0].active_runs[0], epic_id: 'javascript:alert(1)' }],
        }],
      }],
    })).toThrow(/instancias incompletos/)
    expect(() => parseAutomationAgentHistory({
      agent_key: 'frontend-specialist',
      items: [{
        id: 'activity-epic-invalid',
        kind: 'step_activity',
        occurred_at: '2026-09-24T18:20:00Z',
        activity_action: 'evidence',
        epic_id: 'javascript:alert(1)',
      }],
      limit: 50,
      has_more: false,
    })).toThrow(/historial de agente incompleto/)
  })
})
