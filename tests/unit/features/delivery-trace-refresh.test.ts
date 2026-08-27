import { deliveryTraceRefreshInterval } from '@/features/automation/delivery-trace-refresh'
import { describe, expect, it } from 'vitest'

describe('delivery trace refresh interval', () => {
  it('does not poll inactive traces or traces covered by the live stream', () => {
    expect(deliveryTraceRefreshInterval(false, 'live')).toBe(0)
    expect(deliveryTraceRefreshInterval(true, 'live')).toBe(0)
  })

  it('keeps a small fallback cadence while an active stream reconnects', () => {
    expect(deliveryTraceRefreshInterval(true, 'reconnecting')).toBe(8_000)
    expect(deliveryTraceRefreshInterval(true, 'offline')).toBe(8_000)
  })
})
