import { agentAvailability, agentHeartbeatFreshForMs, agentHeartbeatSignal, agentOperationAvailability } from '@/features/automation/agent-availability'
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

  it('keeps the exact 90-second boundary fresh and rejects invalid timestamp evidence', () => {
    expect(agentHeartbeatSignal(health, Date.parse(observedAt) + 90_000).state).toBe('fresh')
    expect(agentHeartbeatSignal(health, Date.parse(observedAt) + 90_001).state).toBe('stale')
    expect(agentHeartbeatSignal({ active_workers: 1, last_worker_seen_at: 'invalid', workers: [{}] }).state).toBe('unknown')
  })

  it('does not present all-draining workers as available despite fresh heartbeats', () => {
    expect(agentAvailability({ ...health, draining_workers: 1 }, false, Date.parse(observedAt))).toMatchObject({
      connected: false,
      label: 'Agentes en drenado',
      detail: expect.stringContaining('ya no aceptan trabajo nuevo'),
    })
  })

  it('keeps partial draining available while another live worker accepts work', () => {
    expect(agentAvailability({ ...health, active_workers: 2, draining_workers: 1 }, false, Date.parse(observedAt))).toMatchObject({
      connected: true,
      label: 'Agentes conectados',
    })
  })

  it.each([
    { capabilities: ['delivery.plan'], operation: 'delivery.plan', state: 'ready' },
    { capabilities: ['delivery.plan'], operation: 'delivery.implement', state: 'unavailable' },
    { capabilities: [], operation: 'delivery.implement', state: 'ready' },
  ])('projects capability fallback for $operation with $capabilities as $state', ({ capabilities, operation, state }) => {
    expect(agentOperationAvailability({ ...health, workers: [{ capabilities, last_seen_at: observedAt }] }, operation)).toMatchObject({
      state,
      detail: expect.stringContaining(state === 'ready' ? 'generalista o especialista' : 'no declaran esta operación'),
    })
  })

  it('rejects capability fallback for drained or absent workers', () => {
    expect(agentOperationAvailability({ ...health, draining_workers: 1 }, 'delivery.plan')).toMatchObject({
      state: 'unavailable', detail: expect.stringContaining('en drenado'),
    })
    expect(agentOperationAvailability({ ...health, active_workers: 0, workers: [] }, 'delivery.plan')).toMatchObject({
      state: 'unavailable', detail: expect.stringContaining('heartbeat reciente'),
    })
  })

  it('prefers operation readiness over the legacy capability fallback', () => {
    const operation_readiness = [{ operation: 'delivery.plan', worker_count: 1, worker_capacity: 1, ready: true }]
    expect(agentOperationAvailability({ ...health, workers: [{ capabilities: ['delivery.implement'] }], operation_readiness }, 'delivery.plan')).toMatchObject({
      state: 'ready', detail: '1 worker puede ejecutar esta fase.',
    })
    expect(agentOperationAvailability({ ...health, draining_workers: 1, operation_readiness }, 'delivery.plan')).toMatchObject({
      state: 'unavailable', detail: expect.stringContaining('en drenado'),
    })
    expect(agentOperationAvailability({ ...health, operation_readiness: [{ ...operation_readiness[0], worker_capacity: 0 }] }, 'delivery.plan')).toMatchObject({
      state: 'unavailable', detail: expect.stringContaining('capacidad disponible'),
    })
  })

  it('keeps missing and failed capability telemetry unknown', () => {
    expect(agentOperationAvailability(undefined, 'delivery.plan').state).toBe('unknown')
    expect(agentOperationAvailability(health, 'delivery.plan', true).state).toBe('unknown')
    expect(agentOperationAvailability({ ...health, operational_telemetry_available: false }, 'delivery.plan').state).toBe('unknown')
  })
})
