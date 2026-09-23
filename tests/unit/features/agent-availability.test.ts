import { agentAvailability, agentHeartbeatFreshForMs, agentHeartbeatSignal } from '@/features/automation/agent-availability'
import { describe, expect, it } from 'vitest'

describe('agent heartbeat presentation', () => {
  const observedAt = '2026-09-22T16:00:00.000Z'
  const health = {
    active_workers: 1,
    operational_telemetry_available: true,
    last_worker_seen_at: observedAt,
    workers: [{ last_seen_at: observedAt, capabilities: ['delivery.plan'] }],
  }

  it('shows the age of a fresh heartbeat using the same liveness window as the server', () => {
    const signal = agentHeartbeatSignal(health, Date.parse(observedAt) + 12_000)

    expect(signal).toMatchObject({ state: 'fresh', label: 'Última señal · hace 12 s', observedAt })
    expect(agentAvailability(health, false, Date.parse(observedAt) + 12_000)).toMatchObject({ connected: true, label: 'Agentes conectados' })
  })

  it('turns a stale browser view into an explicit non-confirmed availability state', () => {
    const now = Date.parse(observedAt) + agentHeartbeatFreshForMs + 1
    const signal = agentHeartbeatSignal(health, now)

    expect(signal).toMatchObject({ state: 'stale', label: 'Señal vencida · hace 1 min' })
    expect(agentAvailability(health, false, now)).toMatchObject({ connected: false, label: 'Señal de agentes vencida' })
  })

  it('does not invent a timestamp when only coarse health is available', () => {
    expect(agentHeartbeatSignal({ active_workers: 1, operational_telemetry_available: true })).toMatchObject({ state: 'unknown', label: 'Última señal no disponible' })
  })
})
