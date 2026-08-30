export const agentLaneCatalog = [
  { role: 'orchestrator', lane: 'orchestration', label: 'Orquestador' },
  { role: 'principal_engineer', lane: 'engineering', label: 'Principal Engineer' },
  { role: 'reviewer', lane: 'review', label: 'Reviewer' },
  { role: 'qa', lane: 'qa', label: 'QA' },
  { role: 'release_manager', lane: 'release', label: 'Release Manager' },
] as const

export type AgentLaneDefinition = (typeof agentLaneCatalog)[number]

export type QueueLaneHealth = {
  available: boolean
  visible: number
  in_flight: number
  delayed: number
}

export type AutomationWorkerHealth = {
  provider?: string
  model?: string
  role?: string
  lane?: string
  concurrency?: number
  started_at?: string
  last_seen_at: string
  workspace_readiness?: Array<{
    id: string
    ready: boolean
    qa_ready: boolean
    visual_qa_ready: boolean
    publication_ready: boolean
    validation_command_count: number
    qa_command_count: number
  }>
}

export type AutomationHealth = {
  queued?: number
  running?: number
  failed_last_day?: number
  expired_leases?: number
  spend_last_day_microusd?: number
  active_workers?: number
  worker_capacity?: number
  queue_telemetry_available?: boolean
  queue_lanes?: Partial<Record<AgentLaneDefinition['lane'], QueueLaneHealth>>
  queue_visible_approximate?: number
  queue_in_flight_approximate?: number
  queue_delayed_approximate?: number
  dead_letter_telemetry_available?: boolean
  dead_letter_visible_approximate?: number
  operational_telemetry_available?: boolean
  last_worker_seen_at?: string
  workers?: AutomationWorkerHealth[]
}

export type AgentLaneStatus = AgentLaneDefinition & {
  workers: number | null
  capacity: number | null
  queue: QueueLaneHealth | null
  preflight: { ready: number; total: number } | null
  state: 'operational' | 'attention' | 'unknown'
}

export function projectAgentLaneHealth(health?: AutomationHealth): AgentLaneStatus[] {
  return agentLaneCatalog.map((definition) => {
    const matchingWorkers = health?.workers?.filter(
      (worker) => worker.role === definition.role && worker.lane === definition.lane,
    )
    const workers = matchingWorkers ? matchingWorkers.length : null
    const capacity = matchingWorkers
      ? matchingWorkers.reduce((total, worker) => total + Math.max(0, worker.concurrency ?? 0), 0)
      : null
    const queue = health?.queue_lanes?.[definition.lane] ?? null
    const readinessReports = matchingWorkers?.flatMap((worker) => worker.workspace_readiness ?? []) ?? []
    const readinessByWorkspace = new Map<string, boolean>()
    for (const workspace of readinessReports) {
      const requiredReady = definition.lane === 'qa'
        ? workspace.qa_ready
        : definition.lane === 'release'
          ? workspace.publication_ready
          : workspace.ready
      readinessByWorkspace.set(workspace.id, (readinessByWorkspace.get(workspace.id) ?? true) && requiredReady)
    }
    const preflight = readinessByWorkspace.size > 0
      ? { ready: [...readinessByWorkspace.values()].filter(Boolean).length, total: readinessByWorkspace.size }
      : null
    const hasBacklog = Boolean(queue && queue.visible + queue.in_flight + queue.delayed > 0)
    const preflightBlocked = Boolean(preflight && preflight.ready < preflight.total)
    const state = (workers === 0 && hasBacklog) || preflightBlocked
      ? 'attention'
      : workers !== null && workers > 0 && queue?.available && preflight?.ready === preflight?.total
        ? 'operational'
        : 'unknown'

    return { ...definition, workers, capacity, queue, preflight, state }
  })
}

export function legacyCombinedWorkerCount(health?: AutomationHealth) {
  return health?.workers?.filter((worker) => !worker.role && !worker.lane).length ?? 0
}
