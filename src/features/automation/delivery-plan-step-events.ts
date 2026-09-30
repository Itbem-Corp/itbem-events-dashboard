import { apiPath } from '@/lib/api-paths'

export const DELIVERY_PLAN_STEP_EVENTS_PAGE_SIZE = 25

export type DeliveryPlanStepEvent = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  automation_task_id: string | null
  run_id: string | null
  agent_key: string | null
  machine_id: string | null
  worker_id?: string | null
  agent_instance_id?: string | null
  summary: string
  occurred_at: string
}

export type DeliveryPlanStepEventsPage = {
  plan_id: string
  plan_version: number
  step_id: string
  items: DeliveryPlanStepEvent[]
  next_cursor: string | null
}

type ParseExpectation = {
  planId: string
  planVersion: number
  stepId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function nullableUUID(value: unknown): value is string | null | undefined {
  return (
    nullableString(value) &&
    (value === undefined || value === null || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))
  )
}

const eventKeys = new Set([
  'id',
  'event_type',
  'from_status',
  'to_status',
  'automation_task_id',
  'run_id',
  'agent_key',
  'machine_id',
  'worker_id',
  'agent_instance_id',
  'summary',
  'occurred_at',
])

function isEvent(value: unknown): value is DeliveryPlanStepEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !eventKeys.has(key))) return false
  const occurredAt = typeof value.occurred_at === 'string' ? Date.parse(value.occurred_at) : Number.NaN
  return (
    typeof value.id === 'string' &&
    typeof value.event_type === 'string' &&
    nullableString(value.from_status) &&
    nullableString(value.to_status) &&
    nullableString(value.automation_task_id) &&
    nullableString(value.run_id) &&
    nullableString(value.agent_key) &&
    nullableString(value.machine_id) &&
    nullableUUID(value.worker_id) &&
    nullableUUID(value.agent_instance_id) &&
    typeof value.summary === 'string' &&
    Number.isFinite(occurredAt)
  )
}

export function deliveryPlanStepEventsPath(planId: string, stepId: string, cursor?: string | null): string {
  const basePath = apiPath(
    `/automation/plans/${encodeURIComponent(planId.trim())}/steps/${encodeURIComponent(stepId.trim())}/events`
  )
  const query = new URLSearchParams({ limit: String(DELIVERY_PLAN_STEP_EVENTS_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  return `${basePath}?${query.toString()}`
}

export function parseDeliveryPlanStepEvents(value: unknown, expectation: ParseExpectation): DeliveryPlanStepEventsPage {
  if (
    !isRecord(value) ||
    typeof value.plan_id !== 'string' ||
    !Number.isInteger(value.plan_version) ||
    typeof value.step_id !== 'string' ||
    !Array.isArray(value.items) ||
    !value.items.every(isEvent) ||
    !(value.next_cursor === null || typeof value.next_cursor === 'string')
  ) {
    throw new Error('La respuesta del historial del paso no tiene el formato esperado.')
  }

  const page = value as unknown as DeliveryPlanStepEventsPage
  if (
    page.plan_id !== expectation.planId ||
    page.plan_version !== expectation.planVersion ||
    page.step_id !== expectation.stepId
  ) {
    throw new Error('El historial recibido no corresponde a este plan y paso.')
  }
  return page
}
