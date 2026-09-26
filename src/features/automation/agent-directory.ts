export type AutomationAgentStatus = 'working' | 'available' | 'draining' | 'offline'

export type AutomationAgentRun = {
  task_id: string
  run_id: string
  operation: string
  status: string
  client_id?: string
  client_name?: string
  project_id?: string
  project_name?: string
  epic_id?: string
  epic_title?: string
  work_item_id?: string
  work_item_title?: string
  step_key?: string
  started_at?: string
}

export type AutomationAgentInstance = {
  worker_id: string
  machine_id?: string
  /** Explicit runtime contracts advertised by this worker's authenticated heartbeat. */
  protocols?: string[]
  status: string
  provider: string
  model: string
  concurrency: number
  draining: boolean
  started_at: string
  last_seen_at: string
  active_runs: AutomationAgentRun[]
}

export const AUTOMATION_AGENT_PLAN_STEP_PROTOCOL = 'delivery.plan_steps.v1'

export type AutomationAgentPlanStepProtocolState = 'supported' | 'legacy' | 'unknown'

/** Missing protocol data is unknown; an explicit list without the step protocol is legacy. */
export function automationAgentPlanStepProtocolState(
  protocols: readonly string[] | undefined
): AutomationAgentPlanStepProtocolState {
  if (protocols === undefined) return 'unknown'
  return protocols.includes(AUTOMATION_AGENT_PLAN_STEP_PROTOCOL) ? 'supported' : 'legacy'
}

export type AutomationAgentProfile = {
  agent_key: string
  name: string
  specialty: string
  description: string
  /** Declared capability labels. Missing means an older API response, not an empty declaration. */
  capabilities: string[]
  /** Allow-listed routing operations. Missing means an older API response, not an empty allow-list. */
  operations?: string[]
  /** Whether the logical profile is configured active; operational status is reported separately. */
  active?: boolean
  status: AutomationAgentStatus
  instance_count: number
  active_run_count: number
  total_runs_30d: number
  spend_30d_microusd: number
  instances: AutomationAgentInstance[]
}

export type AutomationAgentQueueLane = {
  operation: string
  queued_tasks: number
  oldest_queued_at?: string
}

export type AutomationAgentDirectorySnapshot = {
  schema_version: 1
  generated_at: string
  summary: {
    profile_count: number
    live_instances: number
    active_runs: number
    available_slots: number
    queued_tasks: number
    spend_30d_microusd: number
  }
  agents: AutomationAgentProfile[]
  queue_lanes: AutomationAgentQueueLane[]
}

export type AutomationAgentDirectoryScope = {
  client_id?: string
  project_id?: string
}

/** Build an agent-directory key only from the visible company/project scope. */
export function automationAgentDirectoryPath(scope: AutomationAgentDirectoryScope = {}): string {
  const query = new URLSearchParams()
  const clientId = scope.client_id?.trim()
  const projectId = scope.project_id?.trim()
  if (clientId) query.set('client_id', clientId)
  if (projectId) query.set('project_id', projectId)
  const suffix = query.toString()
  return `/automation/agents${suffix ? `?${suffix}` : ''}`
}

export const AUTOMATION_AGENT_HEARTBEAT_STALE_AFTER_MS = 90_000

export type AutomationAgentInstanceOperationalView = {
  liveness: 'live' | 'stale' | 'unknown'
  heartbeatAgeMs: number | null
  reportedActiveRuns: number
  concurrency: number
  unoccupiedCapacity: number
  effectiveAvailableSlots: number
  availability: 'available' | 'saturated' | 'no_capacity' | 'draining' | 'offline' | 'unknown'
}

/** Derive a display-only capacity view from the same directory snapshot. */
export function automationAgentInstanceOperationalView(
  instance: AutomationAgentInstance,
  generatedAt: string
): AutomationAgentInstanceOperationalView {
  const snapshotTime = Date.parse(generatedAt)
  const heartbeatTime = Date.parse(instance.last_seen_at)
  const parsedAge = snapshotTime - heartbeatTime
  const hasComparableTimes = Number.isFinite(snapshotTime) && Number.isFinite(heartbeatTime) && parsedAge >= 0
  const heartbeatAgeMs = hasComparableTimes ? parsedAge : null
  const liveness =
    heartbeatAgeMs === null ? 'unknown' : heartbeatAgeMs < AUTOMATION_AGENT_HEARTBEAT_STALE_AFTER_MS ? 'live' : 'stale'
  const concurrency = Math.max(0, instance.concurrency)
  const reportedActiveRuns = instance.active_runs.length
  const unoccupiedCapacity = Math.max(0, concurrency - reportedActiveRuns)

  let availability: AutomationAgentInstanceOperationalView['availability'] = 'unknown'
  if (liveness === 'stale' || instance.status === 'offline') availability = 'offline'
  else if (liveness === 'live') {
    if (instance.draining || instance.status === 'draining') availability = 'draining'
    else if (instance.status === 'available' || instance.status === 'working') {
      if (concurrency === 0) availability = 'no_capacity'
      else availability = unoccupiedCapacity > 0 ? 'available' : 'saturated'
    }
  }

  return {
    liveness,
    heartbeatAgeMs,
    reportedActiveRuns,
    concurrency,
    unoccupiedCapacity,
    effectiveAvailableSlots: availability === 'available' ? unoccupiedCapacity : 0,
    availability,
  }
}

export type AutomationAgentHistoryKind = 'task' | 'task_event' | 'inference' | 'tool_call' | 'step_event' | 'step_activity'
export type AutomationAgentTaskEventType =
  | 'created'
  | 'claimed'
  | 'status_transition'
  | 'lease_reclaimed'
  | 'assignment_changed'
  | 'attempt_updated'
  | 'recorded'
export type AutomationAgentActivityAction =
  | 'inference'
  | 'tool'
  | 'file_read'
  | 'file_change'
  | 'command'
  | 'validation'
  | 'evidence'
  | 'activity'

export type AutomationAgentHistoryItem = {
  id: string
  kind: AutomationAgentHistoryKind
  occurred_at: string
  task_id?: string
  run_id?: string
  worker_id?: string
  machine_id?: string
  agent_instance_id?: string
  event_type?: AutomationAgentTaskEventType
  previous_status?: string
  attempt_count?: number
  event_sequence?: number
  current_agent_key?: string
  previous_run_id?: string
  previous_worker_id?: string
  previous_agent_key?: string
  previous_machine_id?: string
  previous_agent_instance_id?: string
  operation?: string
  status?: string
  client_id?: string
  client_name?: string
  project_id?: string
  project_name?: string
  epic_id?: string
  epic_title?: string
  work_item_id?: string
  work_item_title?: string
  step_key?: string
  provider?: string
  model?: string
  activity_action?: AutomationAgentActivityAction
  input_tokens?: number
  output_tokens?: number
  total_cost_microusd?: number
  summary?: string
}

export type AutomationAgentHistoryPage = {
  agent_key: string
  items: AutomationAgentHistoryItem[]
  limit: number
  has_more: boolean
  next_cursor?: string
}

export type AutomationAgentHistoryFilters = {
  from?: string
  to?: string
  client_id?: string
  project_id?: string
  work_item_id?: string
  operation?: string
  status?: string
  provider?: string
}

export type AutomationAgentHistoryCorrelationFilters = {
  worker_id?: string
  machine_id?: string
  agent_instance_id?: string
  run_id?: string
}

/** Full UI query shape accepted by GET /automation/agents/:agentKey/history. */
export type AutomationAgentHistoryQueryFilters = Required<AutomationAgentHistoryFilters> &
  Required<AutomationAgentHistoryCorrelationFilters>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isOptionalString(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || isString(record[key])
}

function isOptionalFiniteNumber(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || isFiniteNumber(record[key])
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isUUID(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Epic links are only built from canonical UUIDs returned by an authorized API response. */
export function isSafeAutomationEpicId(value?: string): value is string {
  return value !== undefined && isUUID(value)
}

function isOptionalUUID(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || isUUID(record[key])
}

function isOptionalTaskRunID(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || (typeof record[key] === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(record[key]))
}

function isOptionalAgentKey(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || (typeof record[key] === 'string' && /^[a-z][a-z0-9_-]{1,63}$/.test(record[key]))
}

function isTaskLifecycleStatus(value: unknown): value is string {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'cancel_requested' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'pending' ||
    value === 'ready' ||
    value === 'blocked' ||
    value === 'started' ||
    value === 'recorded'
  )
}

function isAgentTaskEventType(value: unknown): value is AutomationAgentTaskEventType {
  return (
    value === 'created' ||
    value === 'claimed' ||
    value === 'status_transition' ||
    value === 'lease_reclaimed' ||
    value === 'assignment_changed' ||
    value === 'attempt_updated' ||
    value === 'recorded'
  )
}

function isAgentActivityAction(value: unknown): value is AutomationAgentActivityAction {
  return (
    value === 'inference' ||
    value === 'tool' ||
    value === 'file_read' ||
    value === 'file_change' ||
    value === 'command' ||
    value === 'validation' ||
    value === 'evidence' ||
    value === 'activity'
  )
}

function isAgentHistoryItem(value: unknown): value is AutomationAgentHistoryItem {
  if (!isRecord(value)) return false
  const hasCommonFields =
    isString(value.id) &&
    (value.kind === 'task' ||
      value.kind === 'task_event' ||
      value.kind === 'inference' ||
      value.kind === 'tool_call' ||
      value.kind === 'step_event' ||
      value.kind === 'step_activity') &&
    isString(value.occurred_at) &&
    isOptionalString(value, 'task_id') &&
    isOptionalString(value, 'run_id') &&
    isOptionalString(value, 'worker_id') &&
    isOptionalString(value, 'machine_id') &&
    isOptionalString(value, 'agent_instance_id') &&
    isOptionalString(value, 'operation') &&
    isOptionalString(value, 'status') &&
    isOptionalString(value, 'client_id') &&
    isOptionalString(value, 'client_name') &&
    isOptionalString(value, 'project_id') &&
    isOptionalString(value, 'project_name') &&
    isOptionalUUID(value, 'epic_id') &&
    isOptionalString(value, 'epic_title') &&
    isOptionalString(value, 'work_item_id') &&
    isOptionalString(value, 'work_item_title') &&
    isOptionalString(value, 'step_key') &&
    isOptionalString(value, 'provider') &&
    isOptionalString(value, 'model') &&
    (value.kind === 'step_activity'
      ? isAgentActivityAction(value.activity_action)
      : value.activity_action === undefined) &&
    isOptionalFiniteNumber(value, 'input_tokens') &&
    isOptionalFiniteNumber(value, 'output_tokens') &&
    isOptionalFiniteNumber(value, 'total_cost_microusd') &&
    isOptionalString(value, 'summary')
  if (!hasCommonFields) return false

  if (value.kind === 'task_event') {
    return (
      isUUID(value.id) &&
      isUUID(value.task_id) &&
      isAgentTaskEventType(value.event_type) &&
      isTaskLifecycleStatus(value.status) &&
      (value.previous_status === undefined || value.previous_status === '' || isTaskLifecycleStatus(value.previous_status)) &&
      isNonNegativeInteger(value.attempt_count) &&
      isPositiveInteger(value.event_sequence) &&
      isOptionalAgentKey(value, 'current_agent_key') &&
      isOptionalAgentKey(value, 'previous_agent_key') &&
      isOptionalString(value, 'previous_run_id') &&
      isOptionalString(value, 'previous_worker_id') &&
      isOptionalString(value, 'previous_machine_id') &&
      isOptionalString(value, 'previous_agent_instance_id') &&
      isOptionalUUID(value, 'worker_id') &&
      isOptionalUUID(value, 'machine_id') &&
      isOptionalUUID(value, 'agent_instance_id') &&
      isOptionalUUID(value, 'previous_worker_id') &&
      isOptionalUUID(value, 'previous_machine_id') &&
      isOptionalUUID(value, 'previous_agent_instance_id') &&
      isOptionalTaskRunID(value, 'run_id') &&
      isOptionalTaskRunID(value, 'previous_run_id')
    )
  }

  return value.kind !== 'step_activity' || isAgentActivityAction(value.activity_action)
}

/** Validate the allow-listed, cursor-paginated agent history API response. */
export function parseAutomationAgentHistory(value: unknown): AutomationAgentHistoryPage {
  if (
    !isRecord(value) ||
    !isString(value.agent_key) ||
    !Array.isArray(value.items) ||
    !value.items.every(isAgentHistoryItem) ||
    !isFiniteNumber(value.limit) ||
    typeof value.has_more !== 'boolean' ||
    (value.next_cursor !== undefined && value.next_cursor !== null && !isString(value.next_cursor))
  ) {
    throw new Error('El servicio devolvió un historial de agente incompleto o no compatible.')
  }

  if (value.has_more && (typeof value.next_cursor !== 'string' || value.next_cursor.length === 0)) {
    throw new Error('El servicio indicó más actividad, pero no proporcionó el cursor siguiente.')
  }

  return value as unknown as AutomationAgentHistoryPage
}

function isAgentRun(value: unknown): value is AutomationAgentRun {
  if (!isRecord(value)) return false
  return (
    isString(value.task_id) &&
    isString(value.run_id) &&
    isString(value.operation) &&
    isString(value.status) &&
    (value.client_id === undefined || isString(value.client_id)) &&
    (value.client_name === undefined || isString(value.client_name)) &&
    (value.project_id === undefined || isString(value.project_id)) &&
    (value.project_name === undefined || isString(value.project_name)) &&
    isOptionalUUID(value, 'epic_id') &&
    (value.epic_title === undefined || isString(value.epic_title)) &&
    (value.work_item_id === undefined || isString(value.work_item_id)) &&
    (value.work_item_title === undefined || isString(value.work_item_title)) &&
    (value.step_key === undefined || isString(value.step_key)) &&
    (value.started_at === undefined || isString(value.started_at))
  )
}

function isAgentInstance(value: unknown): value is AutomationAgentInstance {
  if (!isRecord(value)) return false
  return (
    isString(value.worker_id) &&
    (value.machine_id === undefined || isString(value.machine_id)) &&
    isString(value.status) &&
    isString(value.provider) &&
    isString(value.model) &&
    isFiniteNumber(value.concurrency) &&
    typeof value.draining === 'boolean' &&
    isString(value.started_at) &&
    isString(value.last_seen_at) &&
    (value.protocols === undefined || isStringArray(value.protocols)) &&
    Array.isArray(value.active_runs) &&
    value.active_runs.every(isAgentRun)
  )
}

function isAgentProfile(value: unknown): value is AutomationAgentProfile {
  if (!isRecord(value)) return false
  return (
    isString(value.agent_key) &&
    isString(value.name) &&
    isString(value.specialty) &&
    isString(value.description) &&
    isStringArray(value.capabilities) &&
    (value.operations === undefined || isStringArray(value.operations)) &&
    (value.active === undefined || typeof value.active === 'boolean') &&
    (value.status === 'working' ||
      value.status === 'available' ||
      value.status === 'draining' ||
      value.status === 'offline') &&
    isFiniteNumber(value.instance_count) &&
    isFiniteNumber(value.active_run_count) &&
    isFiniteNumber(value.total_runs_30d) &&
    isFiniteNumber(value.spend_30d_microusd) &&
    Array.isArray(value.instances) &&
    value.instances.every(isAgentInstance)
  )
}

/** Validate the v1 API boundary so a contract drift cannot render fabricated agent state. */
export function parseAutomationAgentDirectory(value: unknown): AutomationAgentDirectorySnapshot {
  if (!isRecord(value) || value.schema_version !== 1 || !isString(value.generated_at)) {
    throw new Error('El servicio de agentes devolvió una versión de contrato no compatible.')
  }

  const summary = value.summary
  if (
    !isRecord(summary) ||
    !isFiniteNumber(summary.profile_count) ||
    !isFiniteNumber(summary.live_instances) ||
    !isFiniteNumber(summary.active_runs) ||
    !isFiniteNumber(summary.available_slots) ||
    !isFiniteNumber(summary.queued_tasks) ||
    !isFiniteNumber(summary.spend_30d_microusd)
  ) {
    throw new Error('El servicio de agentes devolvió un resumen incompleto.')
  }

  if (!Array.isArray(value.agents) || !value.agents.every(isAgentProfile)) {
    throw new Error('El servicio de agentes devolvió perfiles o instancias incompletos.')
  }

  if (
    !Array.isArray(value.queue_lanes) ||
    !value.queue_lanes.every(
      (lane) =>
        isRecord(lane) &&
        isString(lane.operation) &&
        isFiniteNumber(lane.queued_tasks) &&
        (lane.oldest_queued_at === undefined || isString(lane.oldest_queued_at))
    )
  ) {
    throw new Error('El servicio de agentes devolvió carriles de cola incompletos.')
  }

  return value as unknown as AutomationAgentDirectorySnapshot
}
