import { describe, expect, it } from 'vitest'
import { buildExecutionGraphGroups, buildExecutionGraphItemLayout, buildExecutionGraphLayout, executionGraphTimestamp } from './layout'

const event = (id: string, trackId: string, occurredAt: string) => ({
  id,
  trackId,
  trackLabel: trackId,
  occurredAt,
  title: id,
  summary: id,
  detail: id,
  status: 'complete' as const,
})

describe('buildExecutionGraphLayout', () => {
  it('orders a track from left to right even when input arrives newest first', () => {
    const graph = buildExecutionGraphLayout([
      event('plan-2', 'plan', '2026-08-11T12:02:00Z'),
      event('plan-1', 'plan', '2026-08-11T12:01:00Z'),
    ])

    expect(graph.map((node) => node.event.id)).toEqual(['plan-1', 'plan-2'])
    expect(graph.map((node) => node.x)).toEqual([34, 222])
    expect(graph.map((node) => node.y)).toEqual([28, 28])
  })

  it('opens a new lane only for a different track', () => {
    const graph = buildExecutionGraphLayout([
      event('plan-1', 'plan', '2026-08-11T12:01:00Z'),
      event('qa-1', 'qa', '2026-08-11T12:02:00Z'),
      event('plan-2', 'plan', '2026-08-11T12:03:00Z'),
    ])

    expect(graph.map((node) => [node.event.id, node.x, node.y])).toEqual([
      ['plan-1', 34, 28],
      ['qa-1', 34, 132],
      ['plan-2', 222, 28],
    ])
  })

  it('keeps a large graph deterministic without multiplying lanes', () => {
    const graph = buildExecutionGraphLayout(Array.from({ length: 120 }, (_, index) =>
      event(`node-${index}`, index % 3 === 0 ? 'plan' : 'qa', new Date(Date.UTC(2026, 7, 11, 12, 0, index)).toISOString()),
    ))

    expect(graph).toHaveLength(120)
    expect(new Set(graph.map((node) => node.y))).toEqual(new Set([28, 132]))
  })

  it('treats malformed timestamps as a stable oldest event', () => {
    expect(executionGraphTimestamp('not-a-date')).toBe(0)
    expect(buildExecutionGraphLayout([event('valid', 'qa', '2026-08-11T12:00:00Z'), event('unknown', 'plan', 'not-a-date')]).map((node) => node.event.id)).toEqual(['unknown', 'valid'])
  })

  it('keeps layout and grouping stable when equal timestamps arrive in a different order', () => {
    const events = [
      event('event-b', 'plan', '2026-08-11T12:00:00Z'),
      event('event-a', 'qa', '2026-08-11T12:00:00Z'),
    ]

    expect(buildExecutionGraphLayout(events).map((node) => node.event.id)).toEqual(['event-a', 'event-b'])
    expect(buildExecutionGraphLayout([...events].reverse()).map((node) => node.event.id)).toEqual(['event-a', 'event-b'])
    expect(buildExecutionGraphGroups(events).map((group) => group.events[0].id)).toEqual(['event-a', 'event-b'])
  })

  it('wraps a short compact run before it has to shrink interactive nodes', () => {
    const graph = buildExecutionGraphItemLayout([
      event('context', 'context', '2026-08-11T12:00:00Z'),
      event('plan', 'plan', '2026-08-11T12:01:00Z'),
      event('review', 'review', '2026-08-11T12:02:00Z'),
      event('deliver', 'deliver', '2026-08-11T12:03:00Z'),
    ], { mode: 'compact' })

    expect(graph.map(({ item, x, y }) => [item.id, x, y])).toEqual([
      ['context', 22, 18],
      ['plan', 168, 18],
      ['review', 314, 18],
      ['deliver', 314, 102],
    ])
  })

  it('keeps compact movement as a continuous wrapped sequence', () => {
    const graph = buildExecutionGraphItemLayout([
      event('plan-1', 'plan', '2026-08-11T12:00:00Z'),
      event('qa-1', 'qa', '2026-08-11T12:01:00Z'),
      event('plan-2', 'plan', '2026-08-11T12:02:00Z'),
      event('qa-2', 'qa', '2026-08-11T12:03:00Z'),
      event('ship', 'ship', '2026-08-11T12:04:00Z'),
    ], { mode: 'compact' })

    expect(graph.map(({ item, x, y }) => [item.id, x, y])).toEqual([
      ['plan-1', 22, 18],
      ['qa-1', 168, 18],
      ['plan-2', 314, 18],
      ['qa-2', 314, 102],
      ['ship', 168, 102],
    ])
  })

  it('can use two columns for a narrow card without making its short run taller than needed', () => {
    const graph = buildExecutionGraphItemLayout(Array.from({ length: 7 }, (_, index) =>
      event(`node-${index}`, `entity-${index}`, new Date(Date.UTC(2026, 7, 11, 12, 0, index)).toISOString()),
    ), { mode: 'compact', laneLimit: 2 })

    expect(graph.map(({ x, y }) => [x, y])).toEqual([
      [22, 18], [168, 18], [168, 102], [22, 102], [22, 186], [168, 186], [168, 270],
    ])
  })

  it('keeps long compact runs within three rows before expanding horizontally', () => {
    const graph = buildExecutionGraphItemLayout(Array.from({ length: 18 }, (_, index) =>
      event(`node-${index}`, `entity-${index}`, new Date(Date.UTC(2026, 7, 11, 12, 0, index)).toISOString()),
    ), { mode: 'compact' })

    expect(new Set(graph.map(({ y }) => y))).toEqual(new Set([18, 102, 186]))
  })
})

describe('buildExecutionGraphGroups', () => {
  it('collapses only adjacent events that deliberately share a group', () => {
    const grouped = buildExecutionGraphGroups([
      { ...event('tool-1', 'plan', '2026-08-11T12:01:00Z'), kind: 'tool_call', groupId: 'task-1' },
      { ...event('tool-2', 'plan', '2026-08-11T12:02:00Z'), kind: 'tool_call', groupId: 'task-1', status: 'active' as const },
      { ...event('gate', 'plan', '2026-08-11T12:03:00Z'), kind: 'gate', groupId: 'gate-1' },
      { ...event('tool-3', 'plan', '2026-08-11T12:04:00Z'), kind: 'tool_call', groupId: 'task-1' },
    ])

    expect(grouped.map((group) => group.events.map((item) => item.id))).toEqual([
      ['tool-1', 'tool-2'],
      ['gate'],
      ['tool-3'],
    ])
    expect(grouped[0].status).toBe('active')
    expect(grouped[0].attempts).toBe(2)
  })

  it('keeps task decisions visible even when they share a delivery lane', () => {
    const grouped = buildExecutionGraphGroups([
      { ...event('plan-1', 'plan', '2026-08-11T12:01:00Z'), kind: 'task' },
      { ...event('plan-2', 'plan', '2026-08-11T12:02:00Z'), kind: 'task' },
    ])

    expect(grouped.map((group) => group.events.map((item) => item.id))).toEqual([['plan-1'], ['plan-2']])
  })

  it('uses the latest grouped attempt as the compact phase state', () => {
    const grouped = buildExecutionGraphGroups([
      { ...event('attempt-1', 'plan', '2026-08-11T12:01:00Z'), kind: 'tool_call', groupId: 'plan-run', status: 'attention' as const },
      { ...event('attempt-2', 'plan', '2026-08-11T12:02:00Z'), kind: 'tool_call', groupId: 'plan-run', status: 'complete' as const },
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].status).toBe('complete')
  })
})
