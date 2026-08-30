import { legacyCombinedWorkerCount, projectAgentLaneHealth, type AutomationHealth } from '@/features/automation/agent-lane-health'
import { describe, expect, it } from 'vitest'

describe('agent lane health projection', () => {
  it('keeps every lane unknown when the API provides no per-lane evidence', () => {
    const lanes = projectAgentLaneHealth({ active_workers: 2 })

    expect(lanes).toHaveLength(5)
    expect(lanes.every((lane) => lane.state === 'unknown' && lane.workers === null && lane.queue === null && lane.preflight === null)).toBe(true)
  })

  it('reports an exact role/lane worker as operational only with queue telemetry', () => {
    const health: AutomationHealth = {
      workers: [
        {
          role: 'reviewer',
          lane: 'review',
          concurrency: 2,
          last_seen_at: '2026-08-30T08:00:00Z',
          workspace_readiness: [{ id: 'repo-a', ready: true, qa_ready: false, visual_qa_ready: false, publication_ready: false, validation_command_count: 2, qa_command_count: 0 }],
        },
        {
          role: 'reviewer',
          lane: 'review',
          concurrency: 1,
          last_seen_at: '2026-08-30T08:00:10Z',
          workspace_readiness: [{ id: 'repo-b', ready: true, qa_ready: true, visual_qa_ready: false, publication_ready: false, validation_command_count: 3, qa_command_count: 1 }],
        },
      ],
      queue_lanes: {
        review: { available: true, visible: 0, in_flight: 1, delayed: 0 },
      },
    }

    const review = projectAgentLaneHealth(health).find((lane) => lane.lane === 'review')

    expect(review).toMatchObject({ workers: 2, capacity: 3, preflight: { ready: 2, total: 2 }, state: 'operational' })
  })

  it('raises attention when work exists but the assigned worker is absent', () => {
    const health: AutomationHealth = {
      workers: [],
      queue_lanes: {
        qa: { available: true, visible: 3, in_flight: 0, delayed: 0 },
      },
    }

    expect(projectAgentLaneHealth(health).find((lane) => lane.lane === 'qa')).toMatchObject({
      workers: 0,
      state: 'attention',
    })
  })

  it('fails closed when a role-specific workspace preflight is incomplete', () => {
    const health: AutomationHealth = {
      workers: [{
        role: 'release_manager',
        lane: 'release',
        concurrency: 1,
        last_seen_at: '2026-08-30T08:00:00Z',
        workspace_readiness: [{ id: 'repo-a', ready: true, qa_ready: true, visual_qa_ready: true, publication_ready: false, validation_command_count: 3, qa_command_count: 2 }],
      }],
      queue_lanes: { release: { available: true, visible: 0, in_flight: 0, delayed: 0 } },
    }

    expect(projectAgentLaneHealth(health).find((lane) => lane.lane === 'release')).toMatchObject({
      preflight: { ready: 0, total: 1 },
      state: 'attention',
    })
  })

  it('keeps legacy combined workers visible without crediting any isolated lane', () => {
    const health: AutomationHealth = {
      workers: [{ provider: 'openai', model: 'model', concurrency: 3, last_seen_at: '2026-08-30T08:00:00Z' }],
    }

    expect(legacyCombinedWorkerCount(health)).toBe(1)
    expect(projectAgentLaneHealth(health).every((lane) => lane.workers === 0)).toBe(true)
  })
})
