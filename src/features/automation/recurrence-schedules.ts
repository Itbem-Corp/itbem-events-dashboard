import { apiPath } from '@/lib/api-paths'
import { readApiData } from '@/lib/api-envelope'

export type RecurrenceStatus = 'active' | 'paused' | 'ended'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'
export type RecurrenceWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type RecurrenceTemplate = {
  title: string
  description?: string
  expected_outcome: string
  context_source_ids: string[]
  primary_repository_source_id?: string
  included_scope: string[]
  excluded_scope: string[]
  acceptance_criteria: string[]
  budget_microusd: number
  budget_alert_percent?: number
  max_concurrency?: number
}

export type RecurrenceRule = {
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: RecurrenceWeekday[]
  month_day?: number
  local_time: string
  time_zone: string
  starts_on: string
  ends_on?: string
  misfire_policy: 'coalesce'
}

export type RecurrenceSchedule = {
  id: string
  project_id: string
  name: string
  status: RecurrenceStatus
  template: RecurrenceTemplate
  recurrence: RecurrenceRule
  next_run_at: string | null
  next_run_local?: string
  last_run_at: string | null
  revision: number
  created_at: string
  updated_at: string
}

export type RecurrenceSchedulePage = {
  items: RecurrenceSchedule[]
  limit: number
  offset: number
  next_offset?: number
}

export type RecurrenceOccurrenceStatus = 'materialized' | 'blocked' | 'skipped'

export type RecurrenceScheduleOccurrence = {
  id: string
  schedule_id: string
  schedule_revision: number
  scheduled_for: string
  local_occurrence: string
  time_zone: string
  status: RecurrenceOccurrenceStatus
  work_item_id: string | null
  failure_code: string | null
  created_at: string
  materialized_at: string | null
}

export type RecurrenceScheduleEventType =
  | 'created'
  | 'updated'
  | 'paused'
  | 'resumed'
  | 'ended'
  | 'occurrence_materialized'
  | 'occurrence_blocked'

export type RecurrenceScheduleEvent = {
  id: string
  schedule_id: string
  occurrence_id: string | null
  work_item_id: string | null
  event_type: RecurrenceScheduleEventType
  occurred_at: string
}

export type RecurrenceHistoryPage<Item> = {
  items: Item[]
  limit: number
  offset: number
  next_offset?: number
}

export type RecurrenceHistoryPagination = { limit?: number; offset?: number }

export const RECURRENCE_HISTORY_PAGE_SIZE = 25
export const RECURRENCE_HISTORY_MAX_OFFSET = 10_000

export type RecurrenceScheduleCreateInput = {
  name: string
  template: RecurrenceTemplate
  recurrence: RecurrenceRule
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function requiredText(value: unknown, field: string, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`invalid schedule ${field}`)
  return value.trim()
}

function optionalText(value: unknown, field: string, max = 4000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requiredText(value, field, max)
}

function timestamp(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === undefined || value === null || value === '')) return null
  const parsed = requiredText(value, field, 80)
  if (Number.isNaN(Date.parse(parsed))) throw new Error(`invalid schedule ${field}`)
  return parsed
}

function stringList(value: unknown, field: string, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 1000)) {
    throw new Error(`invalid schedule ${field}`)
  }
  return [...new Set(value.map((item) => (item as string).trim()))]
}

function positiveInteger(value: unknown, field: string, max = 1000): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max) throw new Error(`invalid schedule ${field}`)
  return Number(value)
}

function nonNegativeInteger(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error(`invalid schedule ${field}`)
  return Number(value)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECURRENCE_FAILURE_CODES = new Set([
  'context_not_ready',
  'primary_repository_invalid',
  'project_unavailable',
  'recurrence_invalid',
  'template_invalid',
])
const RECURRENCE_SCHEDULE_EVENT_TYPES = new Set<RecurrenceScheduleEventType>([
  'created', 'updated', 'paused', 'resumed', 'ended', 'occurrence_materialized', 'occurrence_blocked',
])

function uuidText(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === undefined || value === null || value === '')) return null
  if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value === '00000000-0000-0000-0000-000000000000') {
    throw new Error(`invalid schedule history ${field}`)
  }
  return value.toLowerCase()
}

function historyTimestamp(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === undefined || value === null || value === '')) return null
  const parsed = requiredText(value, field, 80)
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`invalid schedule history ${field}`)
  return parsed
}

function parseHistoryPage<Item>(
  payload: unknown,
  expectedScheduleID: string,
  parseItem: (value: unknown, scheduleID: string) => Item,
  expectedPagination?: RecurrenceHistoryPagination,
): RecurrenceHistoryPage<Item> {
  const data = readApiData<unknown>(payload)
  const source = record(data)
  if (!source || !Array.isArray(source.items)) throw new Error('invalid schedule history page')
  const limit = positiveInteger(source.limit, 'history.limit', 100)
  const offset = nonNegativeInteger(source.offset, 'history.offset', RECURRENCE_HISTORY_MAX_OFFSET)
  const nextOffset = source.next_offset === undefined || source.next_offset === null
    ? undefined
    : nonNegativeInteger(source.next_offset, 'history.next_offset', RECURRENCE_HISTORY_MAX_OFFSET + 100)
  if (source.items.length > limit || (nextOffset !== undefined && (nextOffset !== offset + limit || source.items.length !== limit))) {
    throw new Error('invalid schedule history pagination')
  }
  if (expectedPagination && (limit !== expectedPagination.limit || offset !== expectedPagination.offset)) {
    throw new Error('schedule history page does not match requested pagination')
  }
  return {
    items: source.items.map((item) => parseItem(item, expectedScheduleID)),
    limit,
    offset,
    ...(nextOffset !== undefined ? { next_offset: nextOffset } : {}),
  }
}

function parseRecurrenceScheduleOccurrence(value: unknown, expectedScheduleID: string): RecurrenceScheduleOccurrence {
  const source = record(value)
  if (!source) throw new Error('invalid schedule occurrence')
  const id = uuidText(source.id, 'occurrence.id')!
  const scheduleID = uuidText(source.schedule_id, 'occurrence.schedule_id')!
  if (scheduleID !== expectedScheduleID.toLowerCase()) throw new Error('schedule occurrence scope mismatch')
  if (typeof source.occurrence_key !== 'string' || !/^[0-9a-f]{64}$/.test(source.occurrence_key)) {
    throw new Error('invalid schedule occurrence occurrence_key')
  }
  const status = source.status
  if (status !== 'materialized' && status !== 'blocked' && status !== 'skipped') {
    throw new Error('invalid schedule occurrence status')
  }
  const failureCode = source.failure_code === undefined || source.failure_code === null || source.failure_code === ''
    ? null
    : requiredText(source.failure_code, 'occurrence.failure_code', 64)
  if (failureCode && !RECURRENCE_FAILURE_CODES.has(failureCode)) throw new Error('invalid schedule occurrence failure_code')
  const workItemID = uuidText(source.work_item_id, 'occurrence.work_item_id', true)
  const materializedAt = historyTimestamp(source.materialized_at, 'occurrence.materialized_at', true)
  if (status === 'materialized' && (!workItemID || !materializedAt || failureCode)) {
    throw new Error('invalid materialized schedule occurrence')
  }
  if (status === 'blocked' && (workItemID || materializedAt || !failureCode)) {
    throw new Error('invalid blocked schedule occurrence')
  }
  const localOccurrence = requiredText(source.local_occurrence, 'occurrence.local_occurrence', 64)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localOccurrence)) throw new Error('invalid schedule occurrence local_occurrence')
  const timeZone = requiredText(source.time_zone, 'occurrence.time_zone', 128)
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone })
  } catch {
    throw new Error('invalid schedule occurrence time_zone')
  }
  return {
    id,
    schedule_id: scheduleID,
    schedule_revision: positiveInteger(source.schedule_revision, 'occurrence.schedule_revision', 1_000_000),
    scheduled_for: historyTimestamp(source.scheduled_for, 'occurrence.scheduled_for')!,
    local_occurrence: localOccurrence,
    time_zone: timeZone,
    status,
    work_item_id: workItemID,
    failure_code: failureCode,
    created_at: historyTimestamp(source.created_at, 'occurrence.created_at')!,
    materialized_at: materializedAt,
  }
}

function parseRecurrenceScheduleEvent(value: unknown, expectedScheduleID: string): RecurrenceScheduleEvent {
  const source = record(value)
  if (!source) throw new Error('invalid schedule event')
  const id = uuidText(source.id, 'event.id')!
  const scheduleID = uuidText(source.schedule_id, 'event.schedule_id')!
  if (scheduleID !== expectedScheduleID.toLowerCase()) throw new Error('schedule event scope mismatch')
  if (typeof source.event_type !== 'string' || !RECURRENCE_SCHEDULE_EVENT_TYPES.has(source.event_type as RecurrenceScheduleEventType)) {
    throw new Error('invalid schedule event event_type')
  }
  // actor_subject is intentionally not parsed or retained; the API identity is not a display label.
  return {
    id,
    schedule_id: scheduleID,
    occurrence_id: uuidText(source.occurrence_id, 'event.occurrence_id', true),
    work_item_id: uuidText(source.work_item_id, 'event.work_item_id', true),
    event_type: source.event_type as RecurrenceScheduleEventType,
    occurred_at: historyTimestamp(source.occurred_at, 'event.occurred_at')!,
  }
}

function parseTemplate(value: unknown): RecurrenceTemplate {
  const source = record(value)
  if (!source) throw new Error('invalid schedule template')
  const alertPercent = source.budget_alert_percent === undefined
    ? 80
    : positiveInteger(source.budget_alert_percent, 'template.budget_alert_percent', 100)
  const description = optionalText(source.description, 'template.description')
  const primaryRepositorySourceID = optionalText(source.primary_repository_source_id, 'template.primary_repository_source_id', 180)
  const budget = nonNegativeInteger(source.budget_microusd, 'template.budget_microusd')
  if (budget === 0 || budget > 100_000_000_000) throw new Error('invalid schedule template.budget_microusd')
  if (alertPercent < 50) throw new Error('invalid schedule template.budget_alert_percent')
  return {
    title: requiredText(source.title, 'template.title', 180),
    ...(description ? { description } : {}),
    expected_outcome: requiredText(source.expected_outcome, 'template.expected_outcome'),
    context_source_ids: stringList(source.context_source_ids, 'template.context_source_ids'),
    ...(primaryRepositorySourceID ? { primary_repository_source_id: primaryRepositorySourceID } : {}),
    included_scope: stringList(source.included_scope, 'template.included_scope'),
    excluded_scope: stringList(source.excluded_scope, 'template.excluded_scope'),
    acceptance_criteria: stringList(source.acceptance_criteria, 'template.acceptance_criteria'),
    budget_microusd: budget,
    budget_alert_percent: source.budget_alert_percent === undefined ? 80 : alertPercent,
    max_concurrency: source.max_concurrency === undefined ? 1 : positiveInteger(source.max_concurrency, 'template.max_concurrency', 8),
  }
}

function parseRecurrence(value: unknown): RecurrenceRule {
  const source = record(value)
  if (!source) throw new Error('invalid schedule recurrence')
  const frequency = source.frequency
  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') throw new Error('invalid schedule recurrence.frequency')
  const weekdays = source.weekdays === undefined || source.weekdays === null
    ? undefined
    : source.weekdays
  const validWeekdays = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  if (weekdays !== undefined && (!Array.isArray(weekdays) || weekdays.some((day) => typeof day !== 'string' || !validWeekdays.has(day)))) {
    throw new Error('invalid schedule recurrence.weekdays')
  }
  const normalizedWeekdays = weekdays
    ? [...new Set(weekdays as string[])].map((day) => day as NonNullable<RecurrenceRule['weekdays']>[number])
    : undefined
  const monthDay = source.month_day === undefined || source.month_day === null ? undefined : positiveInteger(source.month_day, 'recurrence.month_day', 31)
  if (frequency === 'weekly' && !normalizedWeekdays?.length) throw new Error('invalid schedule recurrence.weekdays')
  if (frequency === 'monthly' && !monthDay) throw new Error('invalid schedule recurrence.month_day')
  if ((frequency !== 'weekly' && normalizedWeekdays?.length) || (frequency !== 'monthly' && monthDay)) throw new Error('invalid schedule recurrence fields')
  if (source.misfire_policy !== 'coalesce') throw new Error('invalid schedule recurrence.misfire_policy')
  const localTime = requiredText(source.local_time, 'recurrence.local_time', 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error('invalid schedule recurrence.local_time')
  const startsOn = requiredText(source.starts_on, 'recurrence.starts_on', 10)
  const endsOn = optionalText(source.ends_on, 'recurrence.ends_on', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))) {
    throw new Error('invalid schedule recurrence date')
  }
  if (endsOn && endsOn < startsOn) throw new Error('invalid schedule recurrence.ends_on')
  const intervalMaximum = frequency === 'daily' ? 365 : frequency === 'weekly' ? 52 : 24
  return {
    frequency,
    interval: positiveInteger(source.interval, 'recurrence.interval', intervalMaximum),
    ...(normalizedWeekdays ? { weekdays: normalizedWeekdays } : {}),
    ...(monthDay ? { month_day: monthDay } : {}),
    local_time: localTime,
    time_zone: requiredText(source.time_zone, 'recurrence.time_zone', 128),
    starts_on: startsOn,
    ...(endsOn ? { ends_on: endsOn } : {}),
    misfire_policy: 'coalesce',
  }
}

export function parseRecurrenceSchedule(value: unknown, expectedProjectId?: string): RecurrenceSchedule {
  const source = record(value)
  if (!source) throw new Error('invalid schedule')
  if (source.status !== 'active' && source.status !== 'paused' && source.status !== 'ended') throw new Error('invalid schedule status')
  const projectId = requiredText(source.project_id, 'project_id', 180)
  if (expectedProjectId && projectId !== expectedProjectId) throw new Error('schedule project scope mismatch')
  const nextRunLocal = optionalText(source.next_run_local, 'next_run_local', 80)
  return {
    id: requiredText(source.id, 'id', 180),
    project_id: projectId,
    name: requiredText(source.name, 'name', 180),
    status: source.status,
    template: parseTemplate(source.template),
    recurrence: parseRecurrence(source.recurrence),
    next_run_at: timestamp(source.next_run_at, 'next_run_at', true),
    ...(nextRunLocal ? { next_run_local: nextRunLocal } : {}),
    last_run_at: timestamp(source.last_run_at, 'last_run_at', true),
    revision: positiveInteger(source.revision, 'revision', 1_000_000),
    created_at: timestamp(source.created_at, 'created_at')!,
    updated_at: timestamp(source.updated_at, 'updated_at')!,
  }
}

export function parseRecurrenceSchedulePage(payload: unknown, expectedProjectId?: string): RecurrenceSchedulePage {
  const data = readApiData<unknown>(payload)
  const source = record(data)
  if (!source || !Array.isArray(source.items)) throw new Error('invalid schedule page')
  const nextOffset = source.next_offset === undefined || source.next_offset === null
    ? undefined
    : nonNegativeInteger(source.next_offset, 'next_offset', 10_000)
  const limit = positiveInteger(source.limit, 'limit', 100)
  const offset = nonNegativeInteger(source.offset, 'offset', 10_000)
  return {
    items: source.items.map((item) => parseRecurrenceSchedule(item, expectedProjectId)),
    limit,
    offset,
    ...(nextOffset !== undefined ? { next_offset: nextOffset } : {}),
  }
}

export function parseRecurrenceOccurrencePage(
  payload: unknown,
  expectedScheduleID: string,
  expectedPagination?: RecurrenceHistoryPagination,
): RecurrenceHistoryPage<RecurrenceScheduleOccurrence> {
  const scheduleID = uuidText(expectedScheduleID, 'schedule_id')!
  return parseHistoryPage(payload, scheduleID, parseRecurrenceScheduleOccurrence, expectedPagination)
}

export function parseRecurrenceEventPage(
  payload: unknown,
  expectedScheduleID: string,
  expectedPagination?: RecurrenceHistoryPagination,
): RecurrenceHistoryPage<RecurrenceScheduleEvent> {
  const scheduleID = uuidText(expectedScheduleID, 'schedule_id')!
  return parseHistoryPage(payload, scheduleID, parseRecurrenceScheduleEvent, expectedPagination)
}

export function parseCreatedRecurrenceSchedule(payload: unknown, expectedProjectId: string): RecurrenceSchedule {
  const data = readApiData<unknown>(payload)
  const source = record(data)
  return parseRecurrenceSchedule(source && 'schedule' in source ? source.schedule : data, expectedProjectId)
}

export function recurrenceSchedulesCollectionPath(projectId: string): string {
  return `/automation/projects/${encodeURIComponent(projectId.trim())}/schedules`
}

export function recurrenceSchedulesPath(projectId: string, offset = 0): string {
  return apiPath(recurrenceSchedulesCollectionPath(projectId), {
    limit: 25,
    offset,
  })
}

function recurrenceScheduleHistoryPath(
  projectId: string,
  scheduleId: string,
  collection: 'occurrences' | 'events',
  pagination: RecurrenceHistoryPagination = {},
): string {
  const normalizedProjectID = requiredText(projectId, 'project_id', 180)
  const normalizedScheduleID = requiredText(scheduleId, 'schedule_id', 180)
  const limit = pagination.limit ?? RECURRENCE_HISTORY_PAGE_SIZE
  const offset = pagination.offset ?? 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid schedule history limit')
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > RECURRENCE_HISTORY_MAX_OFFSET) {
    throw new Error('invalid schedule history offset')
  }
  return apiPath(`${recurrenceSchedulesCollectionPath(normalizedProjectID)}/${encodeURIComponent(normalizedScheduleID)}/${collection}`, { limit, offset })
}

export function recurrenceScheduleOccurrencesPath(
  projectId: string,
  scheduleId: string,
  pagination?: RecurrenceHistoryPagination,
): string {
  return recurrenceScheduleHistoryPath(projectId, scheduleId, 'occurrences', pagination)
}

export function recurrenceScheduleEventsPath(
  projectId: string,
  scheduleId: string,
  pagination?: RecurrenceHistoryPagination,
): string {
  return recurrenceScheduleHistoryPath(projectId, scheduleId, 'events', pagination)
}

export function recurrenceScheduleActionPath(projectId: string, scheduleId: string, action: 'pause' | 'resume'): string {
  return `/automation/projects/${encodeURIComponent(projectId.trim())}/schedules/${encodeURIComponent(scheduleId.trim())}/${action}`
}

export function recurrenceStatusLabel(status: RecurrenceStatus): string {
  if (status === 'active') return 'Activa'
  if (status === 'paused') return 'Pausada'
  return 'Finalizada'
}

export function recurrenceScheduleEventLabel(eventType: RecurrenceScheduleEventType): string {
  const labels: Record<RecurrenceScheduleEventType, string> = {
    created: 'Recurrencia creada',
    updated: 'Configuración actualizada',
    paused: 'Recurrencia pausada',
    resumed: 'Recurrencia reanudada',
    ended: 'Recurrencia finalizada',
    occurrence_materialized: 'Tarea creada en Planeación',
    occurrence_blocked: 'Ocurrencia bloqueada',
  }
  return labels[eventType]
}

export function recurrenceScheduleFailureLabel(code: string): string {
  const labels: Record<string, string> = {
    context_not_ready: 'El contexto del proyecto no estaba listo',
    primary_repository_invalid: 'El repositorio principal no era válido',
    project_unavailable: 'El proyecto no estaba disponible',
    recurrence_invalid: 'La configuración del calendario no era válida',
    template_invalid: 'La plantilla de trabajo no era válida',
  }
  return labels[code] ?? 'No fue posible materializar el trabajo'
}

export function recurrenceFrequencyLabel(rule: RecurrenceRule): string {
  const interval = rule.interval === 1 ? '' : ` cada ${rule.interval}`
  if (rule.frequency === 'daily') return rule.interval === 1 ? 'Diaria' : `Cada ${rule.interval} días`
  if (rule.frequency === 'monthly') return `${rule.interval === 1 ? 'Mensual' : `Cada ${rule.interval} meses`}${rule.month_day ? ` · día ${rule.month_day}` : ''}`
  const weekdayLabels: Record<NonNullable<RecurrenceRule['weekdays']>[number], string> = {
    sun: 'dom.', mon: 'lun.', tue: 'mar.', wed: 'mié.', thu: 'jue.', fri: 'vie.', sat: 'sáb.',
  }
  const days = (rule.weekdays ?? []).map((day) => weekdayLabels[day]).join(', ')
  return `Semanal${interval}${days ? ` · ${days}` : ''}`
}

export function recurrenceScheduleCreateError(error: unknown): string {
  const value = record(error)
  const response = record(value?.response)
  const status = typeof response?.status === 'number' ? response.status : typeof value?.status === 'number' ? value.status : 0
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión y después recarga la pantalla.'
  if (status === 403) return 'Tu sesión no tiene autorización para gestionar recurrencias en este proyecto.'
  if (status === 404) return 'La API de recurrencias todavía no está disponible para este proyecto.'
  if (status === 409) return 'La recurrencia cambió en otra sesión. Recarga la lista antes de volver a intentarlo.'
  if (status === 422) return 'La API rechazó algunos campos del plan o del calendario. Revisa el formulario.'
  return 'No se pudo completar la solicitud. Revisa la conexión y vuelve a intentarlo.'
}
