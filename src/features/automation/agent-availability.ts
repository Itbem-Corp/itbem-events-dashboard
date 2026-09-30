export type AgentAvailabilityHealth = {
  active_workers: number
  draining_workers?: number
  operational_telemetry_available?: boolean
  last_worker_seen_at?: string
  workers?: Array<{ capabilities?: string[]; last_seen_at?: string }>
  operation_readiness?: Array<{ operation: string; worker_count: number; worker_capacity: number; ready: boolean }>
}

export const agentHeartbeatFreshForMs = 90_000

export type AgentHeartbeatSignal = {
  state: 'fresh' | 'stale' | 'unknown'
  label: string
  detail: string
  ageMs?: number
  observedAt?: string
}

function latestHeartbeatAt(health?: AgentAvailabilityHealth) {
  const candidates = [
    health?.last_worker_seen_at,
    ...(health?.workers ?? []).map((worker) => worker.last_seen_at),
  ]
    .filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .sort((left, right) => right.timestamp - left.timestamp)
  return candidates[0]
}

function humanizeHeartbeatAge(ageMs: number) {
  const seconds = Math.max(0, Math.floor(ageMs / 1_000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  return `hace ${Math.floor(minutes / 60)} h`
}

// This client-side clock mirrors the server's 90-second liveness window. It
// prevents a tab that has stopped refreshing from continuing to display an
// old heartbeat as if the worker were still confirmed.
export function agentHeartbeatSignal(health?: AgentAvailabilityHealth, now = Date.now()): AgentHeartbeatSignal {
  const latest = latestHeartbeatAt(health)
  if (!latest) {
    return {
      state: 'unknown',
      label: 'Última señal no disponible',
      detail: 'No recibimos la hora de la última confirmación del worker.',
    }
  }
  const ageMs = Math.max(0, now - latest.timestamp)
  const ageLabel = humanizeHeartbeatAge(ageMs)
  if (ageMs > agentHeartbeatFreshForMs) {
    return {
      state: 'stale',
      label: `Señal vencida · ${ageLabel}`,
      detail: 'La última confirmación superó 90 segundos. Actualiza antes de confiar en la disponibilidad del agente.',
      ageMs,
      observedAt: latest.value,
    }
  }
  return {
    state: 'fresh',
    label: `Última señal · ${ageLabel}`,
    detail: 'Confirmación reciente del worker; el despacho todavía revalida capacidad, presupuesto y permisos.',
    ageMs,
    observedAt: latest.value,
  }
}

// A task row is not a heartbeat. Missing or inaccessible telemetry is unknown,
// never proof that the execution runtime is ready.
export function agentAvailability(health?: AgentAvailabilityHealth, failed = false, now = Date.now()) {
  if (failed || !health || !health.operational_telemetry_available) {
    return {
      connected: false,
      label: 'Disponibilidad sin confirmar',
      detail:
        'No podemos confirmar la conexión de los agentes. Actualiza el estado antes de depender de una ejecución.',
    }
  }
  if (health.active_workers <= 0) {
    return {
      connected: false,
      label: 'Sin agentes conectados',
      detail:
        'No recibimos señales recientes del agente. Puedes preparar un resultado, pero la ejecución necesita un agente conectado y su cola configurada.',
    }
  }
  const heartbeat = agentHeartbeatSignal(health, now)
  if (heartbeat.state === 'stale') {
    return {
      connected: false,
      label: 'Señal de agentes vencida',
      detail: `${heartbeat.detail} ${heartbeat.label}.`,
    }
  }
  if ((health.draining_workers ?? 0) >= health.active_workers) {
    return {
      connected: false,
      label: 'Agentes en drenado',
      detail: 'Los workers siguen presentes, pero ya no aceptan trabajo nuevo. Espera a que terminen o inicia un worker listo.',
    }
  }
  return {
    connected: true,
    label: 'Agentes conectados',
    detail:
      'Hay señales recientes del agente. Cada ejecución seguirá los controles de permisos, presupuesto y aprobación.',
  }
}

export type AgentOperationAvailability = {
  state: 'ready' | 'unavailable' | 'unknown'
  label: string
  detail: string
}

// A live heartbeat only proves that a process is present. This operation-level
// projection also considers the worker's declared capability profile, so a
// plan or implementation gate cannot tell an operator that work is executable
// merely because an unrelated specialist is online.
export function agentOperationAvailability(
  health: AgentAvailabilityHealth | undefined,
  operation: string,
  failed = false,
): AgentOperationAvailability {
  if (failed || !health || !health.operational_telemetry_available) {
    return {
      state: 'unknown',
      label: 'Capacidad sin confirmar',
      detail: 'La telemetría de capacidad no está disponible; el despacho debe volver a comprobar el worker antes de ejecutar.',
    }
  }
  const readiness = health.operation_readiness?.find((lane) => lane.operation === operation)
  if (readiness) {
    const drainingAllWorkers = (health.draining_workers ?? 0) >= health.active_workers
    if (readiness.ready && readiness.worker_count > 0 && readiness.worker_capacity > 0 && !drainingAllWorkers) {
      return {
        state: 'ready',
        label: 'Worker capaz disponible',
        detail: `${readiness.worker_count} worker${readiness.worker_count === 1 ? '' : 's'} puede${readiness.worker_count === 1 ? '' : 'n'} ejecutar esta fase.`,
      }
    }
    return {
      state: 'unavailable',
      label: 'Sin worker capaz',
      detail: drainingAllWorkers
        ? 'Los workers están en drenado y no aceptan trabajo nuevo.'
        : 'Hay agentes conectados, pero ninguno declara capacidad disponible para esta fase.',
    }
  }
  const workers = health.workers ?? []
  if (!workers.length || health.active_workers <= 0 || (health.draining_workers ?? 0) >= health.active_workers) {
    return {
      state: 'unavailable',
      label: 'Sin worker capaz',
      detail: (health.draining_workers ?? 0) >= health.active_workers && health.active_workers > 0
        ? 'Los workers están en drenado y no aceptan trabajo nuevo.'
        : 'No hay un heartbeat reciente que confirme capacidad para esta fase.',
    }
  }
  const capable = workers.some((worker) => {
    const capabilities = worker.capabilities ?? []
    return capabilities.length === 0 || capabilities.includes(operation)
  })
  return capable
    ? { state: 'ready', label: 'Worker capaz disponible', detail: 'Un worker generalista o especialista declara esta operación.' }
    : { state: 'unavailable', label: 'Sin worker capaz', detail: 'Los workers conectados no declaran esta operación.' }
}
