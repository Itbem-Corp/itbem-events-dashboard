export type AutomationDispatchQueueItem = {
  assignment_id: string
  execution_id: string
  step_id: string
  step_key: string
  step_title: string
  step_status: string
  assignment_status: string
  work_item_id: string
  work_item_title: string
  work_item_state: string
  project_id: string
  project_name: string
  client_id: string
  client_name: string
  target_agent_key: string | null
  target_machine_id: string | null
  target_availability: 'unknown' | 'offline' | 'draining' | 'no_capacity' | 'saturated' | 'working' | 'available'
  target_concurrency: number
  target_active_runs: number
  target_available_slots: number
  target_last_seen_at: string | null
  queued_at: string | null
  dispatched_at: string | null
  started_at: string | null
  created_at: string
  is_ready: boolean
}

export type AutomationDispatchQueuePage = {
  schema_version: 1
  generated_at: string
  blocked_assignments?: number
  expired_plan_step_leases?: number
  items: AutomationDispatchQueueItem[]
  next_cursor?: string
}

export function canQueryAutomationDispatchQueue(
  workspaceMode: 'platform' | 'organization',
  selectedProjectId: string,
  visibleProjectIds: readonly string[],
  organizationScopeReady: boolean
) {
  if (workspaceMode === 'platform') return true
  return organizationScopeReady && Boolean(selectedProjectId) && visibleProjectIds.includes(selectedProjectId)
}

const PAGE_KEYS = new Set([
  'schema_version',
  'generated_at',
  'blocked_assignments',
  'expired_plan_step_leases',
  'items',
  'next_cursor',
])
const ITEM_KEYS = new Set([
  'assignment_id',
  'execution_id',
  'step_id',
  'step_key',
  'step_title',
  'step_status',
  'assignment_status',
  'work_item_id',
  'work_item_title',
  'work_item_state',
  'project_id',
  'project_name',
  'client_id',
  'client_name',
  'target_agent_key',
  'target_machine_id',
  'queued_at',
  'dispatched_at',
  'started_at',
  'created_at',
  'is_ready',
  'target_availability',
  'target_concurrency',
  'target_active_runs',
  'target_available_slots',
  'target_last_seen_at',
])

const TARGET_AVAILABILITY = new Set([
  'unknown',
  'offline',
  'draining',
  'no_capacity',
  'saturated',
  'working',
  'available',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value)
}

function isNullableIdentifier(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 256)
}

function isQueueItem(value: unknown): value is AutomationDispatchQueueItem {
  if (!isRecord(value) || !hasOnlyKeys(value, ITEM_KEYS)) return false

  const requiredStrings = [
    'assignment_id',
    'execution_id',
    'step_id',
    'step_key',
    'step_title',
    'step_status',
    'assignment_status',
    'work_item_id',
    'work_item_title',
    'work_item_state',
    'project_id',
    'project_name',
    'client_id',
    'client_name',
  ]
  return (
    requiredStrings.every((key) => typeof value[key] === 'string' && (value[key] as string).length > 0) &&
    isNullableIdentifier(value.target_agent_key) &&
    isNullableIdentifier(value.target_machine_id) &&
    typeof value.target_availability === 'string' &&
    TARGET_AVAILABILITY.has(value.target_availability) &&
    Number.isSafeInteger(value.target_concurrency) &&
    (value.target_concurrency as number) >= 0 &&
    Number.isSafeInteger(value.target_active_runs) &&
    (value.target_active_runs as number) >= 0 &&
    Number.isSafeInteger(value.target_available_slots) &&
    (value.target_available_slots as number) >= 0 &&
    isNullableTimestamp(value.target_last_seen_at) &&
    isNullableTimestamp(value.queued_at) &&
    isNullableTimestamp(value.dispatched_at) &&
    isNullableTimestamp(value.started_at) &&
    isTimestamp(value.created_at) &&
    typeof value.is_ready === 'boolean'
  )
}

/** Strict allow-list: keep future private payload fields out of this read-only console. */
export function parseAutomationDispatchQueue(value: unknown): AutomationDispatchQueuePage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PAGE_KEYS) ||
    value.schema_version !== 1 ||
    !isTimestamp(value.generated_at) ||
    (value.blocked_assignments !== undefined &&
      (!Number.isSafeInteger(value.blocked_assignments) || (value.blocked_assignments as number) < 0)) ||
    (value.expired_plan_step_leases !== undefined &&
      (!Number.isSafeInteger(value.expired_plan_step_leases) || (value.expired_plan_step_leases as number) < 0)) ||
    !Array.isArray(value.items) ||
    !value.items.every(isQueueItem) ||
    (value.next_cursor !== undefined &&
      (typeof value.next_cursor !== 'string' || value.next_cursor.length === 0 || value.next_cursor.length > 4096))
  ) {
    throw new Error('La cola de despacho devolvió datos no compatibles o no seguros.')
  }

  return value as unknown as AutomationDispatchQueuePage
}

export function groupAutomationDispatchQueue(items: readonly AutomationDispatchQueueItem[]) {
  const groups = new Map<
    string,
    { agentKey: string | null; machineId: string | null; items: AutomationDispatchQueueItem[] }
  >()

  for (const item of items) {
    const key = `${item.target_agent_key ?? ''}\u0000${item.target_machine_id ?? ''}`
    const current = groups.get(key) ?? {
      agentKey: item.target_agent_key,
      machineId: item.target_machine_id,
      items: [],
    }
    current.items.push(item)
    groups.set(key, current)
  }

  return [...groups.values()].sort(
    (left, right) =>
      (left.agentKey ?? '').localeCompare(right.agentKey ?? '', 'es') ||
      (left.machineId ?? '').localeCompare(right.machineId ?? '', 'es')
  )
}

export function dispatchQueueStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    queued: 'En cola',
    dispatched: 'Despachada',
    running: 'En ejecución',
    blocked: 'Bloqueada',
    completed: 'Completada',
    failed: 'Fallida',
    cancelled: 'Cancelada',
  }
  return labels[status] ?? status
}

export function dispatchQueueTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
