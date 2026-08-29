import { describe, expect, it } from 'vitest'
import { deliveryExecutionGraphBelongsTo, executionGraphEventsFromDelivery, type DeliveryExecutionGraphSnapshot } from './delivery-execution-graph'

const snapshot: DeliveryExecutionGraphSnapshot = {
  schemaVersion: 1,
  workItemId: 'work-item-1',
  revision: 'revision-1',
  generatedAt: '2026-08-11T12:00:00Z',
  live: true,
  truncated: false,
  nodes: [
    {
      id: 'task-plan', kind: 'task', status: 'running', summary: 'Preparando plan', detail: 'El agente está trabajando.',
      trackId: 'plan', occurredAt: '2026-08-11T12:00:00Z', entity: { type: 'automation_task', id: 'task-1' },
      metadata: { operation: 'delivery.plan', attempt_count: 2 },
      actions: [{ id: 'cancel', targetType: 'automation_task', targetId: 'task-1', requiresConfirmation: true }],
    },
    {
      id: 'tool-qa', kind: 'tool_call', status: 'completed', summary: 'Stagehand', detail: 'QA visual', parentId: 'task-plan',
      trackId: 'plan', occurredAt: '2026-08-11T12:01:00Z', entity: { type: 'automation_tool_execution', id: 'tool-1' },
    },
  ],
  edges: [{ id: 'task-tool', sourceId: 'task-plan', targetId: 'tool-qa', kind: 'uses_tool', status: 'completed' }],
}

describe('executionGraphEventsFromDelivery', () => {
  it('does not reuse a graph snapshot for a different work item', () => {
    expect(deliveryExecutionGraphBelongsTo(snapshot, 'work-item-1')).toBe(true)
    expect(deliveryExecutionGraphBelongsTo({ ...snapshot, work_item_id: 'work-item-1' }, 'work-item-2')).toBe(false)
    expect(deliveryExecutionGraphBelongsTo(undefined, 'work-item-1')).toBe(false)
  })

  it('translates the backend graph without exposing backend-specific structure', () => {
    const [task, tool] = executionGraphEventsFromDelivery(snapshot)

    expect(task).toMatchObject({
      id: 'task-plan', trackLabel: 'Plan', status: 'active', attempts: 2,
      metadata: { entityType: 'automation_task', entityId: 'task-1', taskId: 'task-1' },
    })
    expect(tool).toMatchObject({
      id: 'tool-qa', status: 'complete', parentId: 'task-plan', dependsOn: ['task-plan'], groupId: 'phase:plan',
    })
  })

  it('keeps unknown backend statuses inspectable without raising a false incident', () => {
    const events = executionGraphEventsFromDelivery({
      ...snapshot,
      nodes: [{ ...snapshot.nodes[0], status: 'unexpected' }],
      edges: [],
    })

    expect(events[0].status).toBe('degraded')
  })

  it('keeps repeated phase records distinguishable by their autonomous role', () => {
    const events = executionGraphEventsFromDelivery({
      ...snapshot,
      nodes: [
        { ...snapshot.nodes[0], summary: 'Plan' },
        { ...snapshot.nodes[1], summary: 'Plan' },
      ],
    })

    expect(events.map((event) => event.summary)).toEqual(['Plan', 'Plan · Herramienta'])
  })

  it('keeps the root work item concise without losing its detailed inspector copy', () => {
    const [root] = executionGraphEventsFromDelivery({
      ...snapshot,
      nodes: [{
        id: 'workflow', kind: 'work_item', status: 'active',
        summary: 'Una descripción muy larga del resultado que no debe dominar el grafo',
        detail: 'Detalle completo disponible en el inspector.',
        entity: { type: 'delivery_work_item', id: 'work-item-1' },
      }],
      edges: [],
    })

    expect(root).toMatchObject({ summary: 'Resultado en ejecución', detail: 'Detalle completo disponible en el inspector.' })
  })

  it('uses the original outcome as inspector copy when the root has no separate detail', () => {
    const [root] = executionGraphEventsFromDelivery({
      ...snapshot,
      nodes: [{
        id: 'workflow', kind: 'work_item', status: 'active',
        summary: 'Objetivo original del resultado.',
        entity: { type: 'delivery_work_item', id: 'work-item-1' },
      }],
      edges: [],
    })

    expect(root).toMatchObject({ summary: 'Resultado en ejecución', detail: 'Objetivo original del resultado.' })
  })

  it('hides the workflow root once a real autonomous movement exists', () => {
    const events = executionGraphEventsFromDelivery({
      ...snapshot,
      nodes: [
        {
          id: 'workflow', kind: 'work_item', status: 'waiting', summary: 'Resultado en ejecución',
          entity: { type: 'delivery_work_item', id: 'work-item-1' },
        },
        snapshot.nodes[0],
      ],
      edges: [],
    })

    expect(events.map((event) => event.id)).toEqual(['task-plan'])
  })

  it('reads the snake_case payload produced by the Go API after Axios normalization', () => {
    const [task, tool] = executionGraphEventsFromDelivery({
      schema_version: 1,
      work_item_id: 'work-item-1',
      revision: 'revision-2',
      generated_at: '2026-08-11T12:00:00Z',
      live: true,
      truncated: false,
      nodes: [
        {
          id: 'task-plan', kind: 'task', status: 'running', summary: 'Preparando plan',
          track_id: 'delivery.plan', occurred_at: '2026-08-11T12:00:00Z',
          entity: { type: 'automation_task', id: 'task-1' },
          metadata: { operation: 'delivery.plan', attempt_count: 2 },
          actions: [{ id: 'cancel', target_type: 'automation_task', target_id: 'task-1', requires_confirmation: true }],
        },
        {
          id: 'tool-qa', kind: 'tool_call', status: 'completed', summary: 'Stagehand', parent_id: 'task-plan',
          track_id: 'delivery.plan', occurred_at: '2026-08-11T12:01:00Z',
          entity: { type: 'automation_tool_execution', id: 'tool-1' },
        },
      ],
      edges: [{ id: 'task-tool', source_id: 'task-plan', target_id: 'tool-qa', kind: 'uses_tool', status: 'completed' }],
    })

    expect(task).toMatchObject({
      occurredAt: '2026-08-11T12:00:00Z', trackId: 'delivery.plan', trackLabel: 'Plan',
      groupId: 'phase:delivery.plan', metadata: { taskId: 'task-1', canCancel: true },
    })
    expect(tool).toMatchObject({
      occurredAt: '2026-08-11T12:01:00Z', trackId: 'delivery.plan', parentId: 'task-plan',
      dependsOn: ['task-plan'], groupId: 'phase:delivery.plan', metadata: { taskId: 'task-1' },
    })
  })
})
