import { describe, expect, it } from 'vitest'
import { graphCurrentStatuses, graphHasCurrentAttention, graphLiveState, graphTrackSummary, graphTrackSummaryCompact } from '@/features/automation/live-execution-map'

const event = (id: string, trackId: string, status: 'attention' | 'blocked' | 'complete' | 'active' | 'human' | 'retrying' | 'cancelling' | 'cancelled' | 'degraded', occurredAt: string) => ({
  id,
  trackId,
  trackLabel: 'Plan',
  title: 'Plan',
  summary: 'Plan',
  detail: 'Actividad del agente',
  status,
  occurredAt,
})

describe('graphHasCurrentAttention', () => {
  it('does not keep the global pulse in attention after a later successful retry in the same track', () => {
    expect(graphHasCurrentAttention([
      event('attempt-1', 'delivery.plan', 'attention', '2026-08-12T10:00:00Z'),
      event('attempt-2', 'delivery.plan', 'complete', '2026-08-12T10:01:00Z'),
    ])).toBe(false)
  })

  it('keeps attention when the latest event for a track is blocked', () => {
    expect(graphHasCurrentAttention([
      event('attempt-1', 'delivery.plan', 'complete', '2026-08-12T10:00:00Z'),
      event('attempt-2', 'delivery.plan', 'blocked', '2026-08-12T10:01:00Z'),
    ])).toBe(true)
  })

  it('does not let an undated legacy record replace a newer dated state', () => {
    expect(graphHasCurrentAttention([
      event('attempt-1', 'delivery.plan', 'complete', '2026-08-12T10:01:00Z'),
      event('legacy-attempt', 'delivery.plan', 'attention', ''),
    ])).toBe(false)
  })

  it('uses a stable id tie-break when same-track records share a timestamp', () => {
    const firstOrder = [
      event('event-b', 'delivery.plan', 'complete', '2026-08-12T10:01:00Z'),
      event('event-a', 'delivery.plan', 'attention', '2026-08-12T10:01:00Z'),
    ]
    const secondOrder = [...firstOrder].reverse()

    expect(graphCurrentStatuses(firstOrder)).toEqual(['complete'])
    expect(graphCurrentStatuses(secondOrder)).toEqual(['complete'])
  })

  it('keeps the current safe-closure states available to the live pulse', () => {
    expect(graphCurrentStatuses([
      event('attempt-1', 'delivery.plan', 'active', '2026-08-12T10:00:00Z'),
      event('attempt-2', 'delivery.plan', 'cancelling', '2026-08-12T10:01:00Z'),
      event('attempt-3', 'delivery.qa', 'cancelled', '2026-08-12T10:01:00Z'),
    ])).toEqual(['cancelling', 'cancelled'])
  })

  it('keeps a degraded current state distinct from a human incident', () => {
    const statuses = graphCurrentStatuses([
      event('known', 'delivery.plan', 'complete', '2026-08-12T10:00:00Z'),
      event('new-server-state', 'delivery.publish', 'degraded', '2026-08-12T10:01:00Z'),
    ])

    expect(statuses).toContain('degraded')
    expect(graphHasCurrentAttention([
      event('known', 'delivery.plan', 'complete', '2026-08-12T10:00:00Z'),
      event('new-server-state', 'delivery.publish', 'degraded', '2026-08-12T10:01:00Z'),
    ])).toBe(false)
  })

  it('keeps a current retry visible without turning it into a human incident', () => {
    const statuses = graphCurrentStatuses([
      event('failed-attempt', 'delivery.plan', 'attention', '2026-08-12T10:00:00Z'),
      event('retry-attempt', 'delivery.plan', 'retrying', '2026-08-12T10:01:00Z'),
    ])

    expect(statuses).toEqual(['retrying'])
    expect(graphHasCurrentAttention([
      event('failed-attempt', 'delivery.plan', 'attention', '2026-08-12T10:00:00Z'),
      event('retry-attempt', 'delivery.plan', 'retrying', '2026-08-12T10:01:00Z'),
    ])).toBe(false)
  })

  it('uses an explicit priority when several current branches have different conditions', () => {
    expect(graphLiveState(['retrying', 'degraded', 'cancelling'])).toBe('cancelling')
    expect(graphLiveState(['cancelled', 'retrying'])).toBe('retrying')
    expect(graphLiveState(['retrying', 'attention', 'cancelling'])).toBe('attention')
    expect(graphLiveState(['active', 'human'])).toBe('human')
    expect(graphLiveState(['human', 'attention'])).toBe('attention')
  })

  it('keeps a human gate distinct from passive waiting in the branch summary', () => {
    expect(graphTrackSummary(['active', 'queued', 'human', 'attention', 'complete'])).toBe('1 requiere atención · 1 gate requiere decisión · 2 rutas activas')
    expect(graphTrackSummaryCompact(['active', 'queued', 'human', 'attention', 'complete'])).toBe('1 atención · 1 decisión · 2 activas')
  })
})
