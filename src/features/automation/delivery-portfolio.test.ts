import { describe, expect, it } from 'vitest'
import {
  aggregateDeliveryPortfolioCosts,
  deliveryPortfolioCostCoverage,
  deliveryPortfolioRefreshInterval,
  normalizeDeliveryPortfolio,
  portfolioCostAmountLabel,
  portfolioCostCoverageNote,
  type DeliveryPortfolioSnapshot,
} from './delivery-portfolio'

const idleReviewTotals = { reviewTasks: 0, queuedReviews: 0, runningReviews: 0, attentionReviews: 0, publishedReviews: 0 }

describe('normalizeDeliveryPortfolio', () => {
  it('normalizes the compact snake_case portfolio read model', () => {
    const snapshot = normalizeDeliveryPortfolio({
      schema_version: 1,
      generated_at: '2026-08-12T18:00:00Z',
      revision: 'a1',
      totals: { projects: 1, work_items: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0, automation_tasks: 2, queued_tasks: 1, running_tasks: 1, attention_tasks: 0, total_cost_microusd: 6_200_000, cost_last_30_days_microusd: 1_250_000 },
      projects: [{
        id: 'project-1', client_id: 'client-1', name: 'Experience', status: 'active', updated_at: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
        technology_tags: ['Go 1.25', 'TypeScript', 'Go 1.25'], runtime_hints: ['linux/amd64', 'Node 20'],
        work_item_count: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0, automation_tasks: 2, queued_tasks: 1, running_tasks: 1, attention_tasks: 0, total_cost_microusd: 6_200_000, cost_last_30_days_microusd: 1_250_000,
        work_items_truncated: false,
        work_items: [{
          id: 'work-1', project_id: 'project-1', title: 'Pulir automation', state: 'implementation', created_at: '2026-08-12T16:00:00Z', updated_at: '2026-08-12T17:00:00Z',
          automation_task_count: 2, automation_tasks_truncated: false,
          automation_tasks: [{ id: 'task-1', operation: 'delivery.implementation', status: 'running', attempt_count: 1, created_at: '2026-08-12T16:00:00Z', updated_at: '2026-08-12T17:00:00Z' }],
          gate_summary: { total: 1, approved: 1, changes_requested: 0 }, evidence_count: 3,
          workflow_projection: {
            schema_version: 1, stage: 'build', state_kind: 'active', summary: 'Trabajando', detail: 'El agente continúa.', state: 'implementation',
            actor: { type: 'agent', operation: 'delivery.implementation' }, last_activity_at: '2026-08-12T17:00:00Z', stale_after_seconds: 120, stale: false,
            evidence: { total: 3, validations: 1, has_result: true, has_changes: true, has_human_gate: true }, recovery: { mode: 'repair', title: 'Revisa el fallo', detail: 'Consulta la actividad.', action_id: 'open_activity', requires_human_review: true }, available_actions: [], can_continue: true,
          },
        }],
      }],
    })

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      revision: 'a1',
      totals: { runningTasks: 1, totalCostMicros: 6_200_000, costLast30DaysMicros: 1_250_000 },
      projects: [{
        client: { name: 'ITBEM' },
        technologyTags: ['Go 1.25', 'TypeScript'],
        runtimeHints: ['linux/amd64', 'Node 20'],
        totalCostMicros: 6_200_000,
        costLast30DaysMicros: 1_250_000,
        workItems: [{
          state: 'implementation', automationTasks: [{ status: 'running', attemptCount: 1 }], evidenceCount: 3, workflowProjection: { state_kind: 'active', stage: 'build', summary: 'Trabajando', evidence: { total: 3 }, recovery: { mode: 'repair', action_id: 'open_activity', requires_human_review: true } },
        }],
      }],
    })
    expect(snapshot?.summarySourcesUnavailable).toEqual([])
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

  it('defaults missing technology and runtime signals for rolling backend deployments', () => {
    const snapshot = normalizeDeliveryPortfolio({
      schema_version: 3,
      generated_at: '2026-08-12T18:00:00Z',
      revision: 'old-backend',
      totals: {},
      projects: [{
        id: 'project-1', client_id: 'client-1', name: 'Experience', status: 'active', updated_at: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
      }],
    })

    expect(snapshot?.projects[0]).toMatchObject({ technologyTags: [], runtimeHints: [] })
  })

  it('preserves project and global price coverage fields without inventing zeros for missing transition fields', () => {
    const snapshot = normalizeDeliveryPortfolio({
      schema_version: 1,
      generated_at: '2026-08-12T18:00:00Z',
      revision: 'cost-coverage',
      totals: {
        total_cost_microusd: 900,
        unpriced_executions: 4,
        cost_last_30_days_microusd: 300,
        unpriced_executions_last_30_days: 2,
      },
      projects: [
        {
          id: 'project-priced', client_id: 'client-1', name: 'Priced', status: 'active', updated_at: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
          total_cost_microusd: 700, unpriced_executions: 3, cost_last_30_days_microusd: 200, unpriced_executions_last_30_days: 1,
        },
        {
          id: 'project-transition', client_id: 'client-1', name: 'Transition', status: 'active', updated_at: '2026-08-12T17:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
          cost_last_30_days_microusd: 100,
        },
      ],
    })

    expect(snapshot?.totals).toMatchObject({
      totalCostMicros: 900,
      unpricedExecutions: 4,
      costLast30DaysMicros: 300,
      unpricedExecutionsLast30Days: 2,
    })
    expect(snapshot?.projects[0]).toMatchObject({
      totalCostMicros: 700,
      unpricedExecutions: 3,
      costLast30DaysMicros: 200,
      unpricedExecutionsLast30Days: 1,
    })
    expect(snapshot?.projects[1]).toMatchObject({ costLast30DaysMicros: 100 })
    expect(snapshot?.projects[1]).not.toHaveProperty('unpricedExecutionsLast30Days')
  })

  it('classifies complete, partial and transition-unknown costs without calling an unknown subtotal free', () => {
    const formatUsd = (micros: number) => `$${(micros / 1_000_000).toFixed(4)}`
    const complete = deliveryPortfolioCostCoverage(2500, 0)
    const partial = deliveryPortfolioCostCoverage(1800, 2)
    const unknown = deliveryPortfolioCostCoverage(1800, undefined)

    expect(complete.status).toBe('complete')
    expect(portfolioCostAmountLabel(complete, formatUsd)).toBe('$0.0025')
    expect(partial.status).toBe('partial')
    expect(portfolioCostAmountLabel(partial, formatUsd)).toBe('Subtotal USD verificable: $0.0018')
    expect(portfolioCostCoverageNote(partial)).toMatch(/2 ejecuciones sin precio USD verificable/)
    expect(unknown).toMatchObject({ status: 'unknown', verifiedSubtotalMicros: 1800 })
    expect(portfolioCostAmountLabel(unknown, formatUsd)).toContain('Subtotal USD verificable')
    expect(portfolioCostCoverageNote(unknown)).toContain('Sólo se suman subtotales USD disponibles')
  })

  it('aggregates only known project subtotals and marks mixed client coverage unknown', () => {
    const coverage = aggregateDeliveryPortfolioCosts([
      { costLast30DaysMicros: 2_500_000, unpricedExecutionsLast30Days: 2 },
      { costLast30DaysMicros: 750_000, unpricedExecutionsLast30Days: 0 },
      { unpricedExecutionsLast30Days: 0 },
    ])

    expect(coverage).toEqual({
      status: 'unknown',
      verifiedSubtotalMicros: 3_250_000,
      unpricedExecutions: 2,
      unknownProjects: 1,
    })
    expect(portfolioCostAmountLabel(coverage, (micros) => `$${(micros / 1_000_000).toFixed(2)}`)).toBe(
      'Subtotal USD verificable: $3.25'
    )
    expect(portfolioCostCoverageNote(coverage)).toMatch(/total puede ser mayor o desconocido.*2 ejecuciones.*1 proyecto/)
  })

  it('polls more quickly only while the portfolio has live work', () => {
    expect(deliveryPortfolioRefreshInterval(null)).toBe(15_000)
    const snapshot = (overrides: Partial<DeliveryPortfolioSnapshot['totals']> = {}): DeliveryPortfolioSnapshot => ({
      schemaVersion: 1,
      generatedAt: '',
      revision: '',
      projects: [],
      reviewQueue: [],
      totals: {
        projects: 0,
        workItems: 0,
        activeWorkItems: 0,
        decisionsRequired: 0,
        blockedWorkItems: 0,
        automationTasks: 0,
        queuedTasks: 0,
        runningTasks: 0,
        attentionTasks: 0,
        ...idleReviewTotals,
        totalCostMicros: 0,
        costLast30DaysMicros: 0,
        ...overrides,
      },
    })
    expect(deliveryPortfolioRefreshInterval(snapshot({ runningTasks: 1 }))).toBe(6_000)
    expect(deliveryPortfolioRefreshInterval(snapshot({ activeWorkItems: 1 }))).toBe(12_000)
    expect(deliveryPortfolioRefreshInterval(snapshot())).toBe(30_000)
  })
})
