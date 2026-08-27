export type DeliveryTraceStreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'

/**
 * The work-item stream invalidates an active trace as the agent moves. Keep a
 * small polling fallback only while that channel is not healthy, preventing a
 * selected trace from doubling the request cadence during normal live work.
 */
export function deliveryTraceRefreshInterval(
  active: boolean,
  streamStatus: DeliveryTraceStreamStatus,
) {
  if (!active || streamStatus === 'live') return 0
  return 8_000
}
