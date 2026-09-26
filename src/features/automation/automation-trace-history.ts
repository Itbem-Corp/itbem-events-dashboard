export type AutomationTraceItem = {
  id: string
  kind: string
  occurred_at: string
  automation_task_id?: string | null
  run_id?: string | null
  agent_key?: string | null
  worker_id?: string | null
  machine_id?: string | null
  agent_instance_id?: string | null
  client_id?: string | null
  client_name?: string | null
  project_id?: string | null
  project_name?: string | null
  epic_id?: string | null
  epic_title?: string | null
  work_item_id?: string | null
  work_item_title?: string | null
  step_id?: string | null
  step_key?: string | null
  operation?: string | null
  tool?: string | null
  status?: string | null
  event_type?: string | null
  previous_status?: string | null
  previous_agent_key?: string | null
  previous_machine_id?: string | null
  provider?: string | null
  model?: string | null
  input_tokens?: number | null
  output_tokens?: number | null
  cached_input_tokens?: number | null
  cache_write_tokens?: number | null
  latency_ms?: number | null
  total_cost_microusd?: number | null
  cost_pricing_status?: 'verified_usd' | 'unknown' | null
  summary?: string | null
  activity_action?: string | null
  activity_details?: unknown
}

export type AutomationTraceCostCoverage = {
  scope: 'returned_page'
  verified_usd_executions: number
  unpriced_executions: number
}

export type AutomationTracePage = {
  items: AutomationTraceItem[]
  cost_coverage?: AutomationTraceCostCoverage
  limit: number
  has_more: boolean
  next_cursor?: string
  snapshot_at: string
}

const ITEM_KEYS = new Set([
  'id', 'kind', 'occurred_at', 'automation_task_id', 'run_id', 'agent_key', 'worker_id', 'machine_id', 'agent_instance_id',
  'client_id', 'client_name', 'project_id', 'project_name', 'epic_id', 'epic_title',
  'work_item_id', 'work_item_title', 'step_id', 'step_key', 'operation', 'tool', 'status',
  'event_type', 'previous_status', 'previous_agent_key', 'previous_machine_id',
  'provider', 'model', 'input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_tokens',
  'latency_ms', 'total_cost_microusd', 'cost_pricing_status', 'summary',
  'activity_action', 'activity_details',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalSafeString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function optionalCount(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

const GATE_EVENT_TYPES = new Set(['plan', 'code_review', 'qa', 'release'])
const ASSIGNMENT_EVENT_TYPES = new Set(['assignment_created', 'status_changed', 'target_changed', 'status_and_target_changed'])
const AUTOMATION_TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const COST_PRICING_STATUSES = new Set(['verified_usd', 'unknown'])

function isTraceCostCoverage(value: unknown): value is AutomationTraceCostCoverage {
  if (!isRecord(value) || Object.keys(value).some((key) => !['scope', 'verified_usd_executions', 'unpriced_executions'].includes(key))) return false
  return value.scope === 'returned_page' &&
    typeof value.verified_usd_executions === 'number' && Number.isSafeInteger(value.verified_usd_executions) && value.verified_usd_executions >= 0 &&
    typeof value.unpriced_executions === 'number' && Number.isSafeInteger(value.unpriced_executions) && value.unpriced_executions >= 0
}

function isTraceItem(value: unknown): value is AutomationTraceItem {
  if (!isRecord(value) || Object.keys(value).some((key) => !ITEM_KEYS.has(key))) return false
  const validFields = [...ITEM_KEYS].filter((key) => !['id', 'kind', 'occurred_at', 'activity_details'].includes(key)).every((key) =>
    key.endsWith('_tokens') || key === 'total_cost_microusd' || key === 'latency_ms' ? optionalCount(value[key]) : optionalSafeString(value[key]),
  )
  const validPricingStatus = value.cost_pricing_status === undefined || value.cost_pricing_status === null ||
    (typeof value.cost_pricing_status === 'string' && COST_PRICING_STATUSES.has(value.cost_pricing_status))
  const validGate = value.kind !== 'gate_decision' || (
    typeof value.event_type === 'string' && GATE_EVENT_TYPES.has(value.event_type) &&
    (value.status === 'approved' || value.status === 'changes_requested')
  )
  const validAssignment = value.kind !== 'assignment_event' || (
    typeof value.event_type === 'string' && ASSIGNMENT_EVENT_TYPES.has(value.event_type)
  )
  const validAutomationTaskID = value.automation_task_id === undefined || value.automation_task_id === null ||
    (typeof value.automation_task_id === 'string' && AUTOMATION_TASK_ID_PATTERN.test(value.automation_task_id))
  const validRunID = value.run_id === undefined || value.run_id === null ||
    (typeof value.run_id === 'string' && RUN_ID_PATTERN.test(value.run_id))

  return typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.kind === 'string' && typeof value.occurred_at === 'string' && Number.isFinite(Date.parse(value.occurred_at)) &&
    validFields && validPricingStatus && validGate && validAssignment && validAutomationTaskID && validRunID
}

export type AutomationTraceCostState =
  | { status: 'verified'; amountMicrousd: number }
  | { status: 'unknown' }
  | { status: 'unavailable' }

/** Never treat an unpriced provider event or an amount without an explicit pricing status as USD. */
export function automationTraceCostState(item: AutomationTraceItem): AutomationTraceCostState {
  if (item.cost_pricing_status === 'verified_usd' && item.total_cost_microusd != null) {
    return { status: 'verified', amountMicrousd: item.total_cost_microusd }
  }
  if (item.cost_pricing_status === 'unknown' || item.total_cost_microusd != null || item.kind === 'inference' || item.kind === 'tool_call') {
    return { status: 'unknown' }
  }
  return { status: 'unavailable' }
}

/** Fail closed if the trace service adds private payload fields to the UI contract. */
export function parseAutomationTraceHistory(value: unknown): AutomationTracePage {
  if (!isRecord(value) || Object.keys(value).some((key) => !['items', 'cost_coverage', 'limit', 'has_more', 'next_cursor', 'snapshot_at'].includes(key)) ||
    !Array.isArray(value.items) || !value.items.every(isTraceItem) ||
    (value.cost_coverage !== undefined && !isTraceCostCoverage(value.cost_coverage)) ||
    typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100 ||
    typeof value.has_more !== 'boolean' || typeof value.snapshot_at !== 'string' || !Number.isFinite(Date.parse(value.snapshot_at)) ||
    (value.next_cursor !== undefined && (typeof value.next_cursor !== 'string' || value.next_cursor.length > 4096)) ||
    (value.has_more && (typeof value.next_cursor !== 'string' || value.next_cursor.length === 0))) {
    throw new Error('El servicio devolvió una página de trazas no compatible o no segura.')
  }

  return value as unknown as AutomationTracePage
}
