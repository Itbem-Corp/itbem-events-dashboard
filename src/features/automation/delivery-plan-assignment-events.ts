import { apiPath } from '@/lib/api-paths'

export const DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE = 25

export type DeliveryPlanAssignmentEventFilters = {
  step_id?: string
  assignment_id?: string
  task_id?: string
  status?: string
  agent_key?: string
  machine_id?: string
}

export type DeliveryPlanAssignmentEvent = {
  id: string
  assignment_id: string
  execution_id: string
  step_id: string
  parent_task_id: string
  task_id: string
  event_type: 'assignment_created' | 'status_changed' | 'target_changed' | 'status_and_target_changed'
  previous_status: string
  status: string
  previous_target_agent_key: string
  target_agent_key: string
  previous_target_machine_id: string
  target_machine_id: string
  occurred_at: string
}

export type DeliveryPlanAssignmentEventsPage = {
  plan_id: string
  plan_version: number
  items: DeliveryPlanAssignmentEvent[]
  next_cursor: string | null
}

export const DELIVERY_PLAN_ASSIGNMENT_STATUSES = [
  'pending',
  'queued',
  'dispatched',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const eventTypes = new Set<DeliveryPlanAssignmentEvent['event_type']>([
  'assignment_created',
  'status_changed',
  'target_changed',
  'status_and_target_changed',
])
const statusSet = new Set<string>(DELIVERY_PLAN_ASSIGNMENT_STATUSES)
const eventKeys = new Set([
  'id',
  'assignment_id',
  'execution_id',
  'step_id',
  'parent_task_id',
  'task_id',
  'event_type',
  'previous_status',
  'status',
  'previous_target_agent_key',
  'target_agent_key',
  'previous_target_machine_id',
  'target_machine_id',
  'occurred_at',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSafeKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && !/[\u0000-\u001f\u007f]/.test(value)
}

function isStatus(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty && value === '' || statusSet.has(value))
}

function isEvent(value: unknown): value is DeliveryPlanAssignmentEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !eventKeys.has(key))) return false
  const occurredAt = typeof value.occurred_at === 'string' ? Date.parse(value.occurred_at) : Number.NaN
  return (
    typeof value.id === 'string' && uuidPattern.test(value.id) &&
    typeof value.assignment_id === 'string' && uuidPattern.test(value.assignment_id) &&
    typeof value.execution_id === 'string' && uuidPattern.test(value.execution_id) &&
    typeof value.step_id === 'string' && uuidPattern.test(value.step_id) &&
    typeof value.parent_task_id === 'string' && uuidPattern.test(value.parent_task_id) &&
    typeof value.task_id === 'string' && uuidPattern.test(value.task_id) &&
    typeof value.event_type === 'string' && eventTypes.has(value.event_type as DeliveryPlanAssignmentEvent['event_type']) &&
    isStatus(value.previous_status, true) && isStatus(value.status) &&
    isSafeKey(value.previous_target_agent_key) && isSafeKey(value.target_agent_key) &&
    isSafeKey(value.previous_target_machine_id) && isSafeKey(value.target_machine_id) &&
    Number.isFinite(occurredAt)
  )
}

export function deliveryPlanAssignmentEventsPath(
  planId: string,
  cursor?: string | null,
  filters: DeliveryPlanAssignmentEventFilters = {},
): string {
  const query: Record<string, string | number> = { limit: DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE }
  if (cursor) query.cursor = cursor
  for (const key of ['step_id', 'assignment_id', 'task_id', 'status', 'agent_key', 'machine_id'] as const) {
    const value = filters[key]?.trim()
    if (value) query[key] = value
  }
  return apiPath(`/automation/plans/${encodeURIComponent(planId.trim())}/assignment-events`, query)
}

export function parseDeliveryPlanAssignmentEvents(
  value: unknown,
  expectation: { planId: string; planVersion: number },
): DeliveryPlanAssignmentEventsPage {
  if (
    !isRecord(value) ||
    typeof value.plan_id !== 'string' ||
    !Number.isInteger(value.plan_version) ||
    !Array.isArray(value.items) ||
    !value.items.every(isEvent) ||
    !(value.next_cursor === undefined || value.next_cursor === null || typeof value.next_cursor === 'string')
  ) {
    throw new Error('La respuesta del historial de asignaciones no tiene el formato permitido.')
  }

  if (value.plan_id !== expectation.planId || value.plan_version !== expectation.planVersion) {
    throw new Error('El historial recibido no corresponde a este plan y versión.')
  }

  const cursor = typeof value.next_cursor === 'string' && value.next_cursor.length > 0 ? value.next_cursor : null
  if (cursor && cursor.length > 2048) throw new Error('El cursor del historial supera el límite permitido.')

  return {
    plan_id: value.plan_id,
    plan_version: value.plan_version as number,
    items: value.items,
    next_cursor: cursor,
  }
}
