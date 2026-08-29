import { deliveryCostRefreshInterval } from '@/features/automation/delivery-cost-refresh'
import { describe, expect, it } from 'vitest'

describe('delivery cost refresh interval', () => {
  const now = Date.parse('2026-08-13T18:00:00.000Z')

  it('uses a short recovery cadence before the first snapshot', () => {
    expect(deliveryCostRefreshInterval(undefined, now)).toBe(15_000)
  })

  it('prioritizes guardrail signals over a normal cadence', () => {
    expect(deliveryCostRefreshInterval({ task_budget_watch: [{ status: 'exceeded' }] }, now)).toBe(8_000)
  })

  it('keeps recent executions responsive and idles down after activity settles', () => {
    expect(deliveryCostRefreshInterval({ recent_executions: [{ completed_at: '2026-08-13T17:59:00.000Z' }] }, now)).toBe(10_000)
    expect(deliveryCostRefreshInterval({ recent_executions: [{ completed_at: '2026-08-13T17:50:00.000Z' }] }, now)).toBe(45_000)
  })
})
