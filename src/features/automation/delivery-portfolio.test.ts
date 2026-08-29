import { describe, expect, it } from 'vitest'
import { deliveryPortfolioRefreshInterval, normalizeDeliveryPortfolio } from './delivery-portfolio'

describe('normalizeDeliveryPortfolio', () => {
  it('normalizes the compact snake_case portfolio read model', () => {
    const snapshot = normalizeDeliveryPortfolio({
      schema_version: 1,
      generated_at: '2026-08-12T18:00:00Z',
      revision: 'a1',
      totals: { projects: 1, work_items: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0, automation_tasks: 2, queued_tasks: 1, running_tasks: 1, attention_tasks: 0 },
      projects: [{
        id: 'project-1', client_id: 'client-1', name: 'Experience', status: 'active', updated_at: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
        work_item_count: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0, automation_tasks: 2, queued_tasks: 1, running_tasks: 1, attention_tasks: 0,
        work_items_truncated: false,
        work_items: [{
          id: 'work-1', project_id: 'project-1', title: 'Pulir automation', state: 'implementation', created_at: '2026-08-12T16:00:00Z', updated_at: '2026-08-12T17:00:00Z',
          automation_task_count: 2, automation_tasks_truncated: false,
          automation_tasks: [{ id: 'task-1', operation: 'delivery.implementation', status: 'running', attempt_count: 1, created_at: '2026-08-12T16:00:00Z', updated_at: '2026-08-12T17:00:00Z' }],
          gate_summary: { total: 1, approved: 1, changes_requested: 0 }, evidence_count: 3,
        }],
      }],
    })

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      revision: 'a1',
      totals: { runningTasks: 1 },
      projects: [{
        client: { name: 'ITBEM' },
        workItems: [{
          state: 'implementation', automationTasks: [{ status: 'running', attemptCount: 1 }], evidenceCount: 3,
        }],
      }],
    })
  })

  it('rejects malformed task state instead of marking it as autonomous progress', () => {
    const snapshot = normalizeDeliveryPortfolio({
      schemaVersion: 1, generatedAt: '2026-08-12T18:00:00Z', revision: 'a2', totals: {},
      projects: [{
        id: 'project-1', clientId: 'client-1', name: 'Experience', status: 'active', updatedAt: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
        workItems: [{
          id: 'work-1', projectId: 'project-1', title: 'Pulir', state: 'implementation', createdAt: '2026-08-12T16:00:00Z', updatedAt: '2026-08-12T17:00:00Z',
          automationTaskCount: 1, automationTasks: [{ id: 'task-1', operation: 'delivery.implementation', status: 'unknown', createdAt: '2026-08-12T16:00:00Z', updatedAt: '2026-08-12T17:00:00Z' }], gateSummary: {}, evidenceCount: 0,
        }],
      }],
    })

    expect(snapshot?.projects[0]?.workItems[0]?.automationTasks).toEqual([])
  })

  it('polls more quickly only while the portfolio has live work', () => {
    expect(deliveryPortfolioRefreshInterval(null)).toBe(15_000)
    expect(deliveryPortfolioRefreshInterval({ schemaVersion: 1, generatedAt: '', revision: '', projects: [], totals: { projects: 0, workItems: 0, activeWorkItems: 0, decisionsRequired: 0, blockedWorkItems: 0, automationTasks: 0, queuedTasks: 0, runningTasks: 1, attentionTasks: 0 } })).toBe(6_000)
    expect(deliveryPortfolioRefreshInterval({ schemaVersion: 1, generatedAt: '', revision: '', projects: [], totals: { projects: 0, workItems: 1, activeWorkItems: 1, decisionsRequired: 0, blockedWorkItems: 0, automationTasks: 1, queuedTasks: 0, runningTasks: 0, attentionTasks: 0 } })).toBe(12_000)
    expect(deliveryPortfolioRefreshInterval({ schemaVersion: 1, generatedAt: '', revision: '', projects: [], totals: { projects: 0, workItems: 0, activeWorkItems: 0, decisionsRequired: 0, blockedWorkItems: 0, automationTasks: 0, queuedTasks: 0, runningTasks: 0, attentionTasks: 0 } })).toBe(30_000)
  })
})
