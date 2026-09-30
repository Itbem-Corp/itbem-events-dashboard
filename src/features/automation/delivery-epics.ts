import { apiPath, deliveryProjectPath } from '@/lib/api-paths'

export type DeliveryEpicStatus = 'planned' | 'active' | 'blocked' | 'completed' | 'cancelled' | 'archived'

export type DeliveryEpicSummary = {
  id: string
  project_id: string
  title: string
  summary?: string
  status: DeliveryEpicStatus | string
  task_count: number
  created_at: string
  updated_at: string
}

export type DeliveryEpicListPage = {
  can_manage: boolean
  items: DeliveryEpicSummary[]
  limit: number
  next_cursor?: string
}

export type DeliveryEpicWorkItem = {
  id: string
  title: string
  state: string
  added_at: string
  created_at: string
  updated_at: string
}

export type DeliveryEpicDetail = {
  can_manage: boolean
  epic: DeliveryEpicSummary
  work_items: {
    items: DeliveryEpicWorkItem[]
    total: number
    limit: number
    next_cursor?: string
  }
}

export type UpdateDeliveryEpicPayload = {
  title: string
  summary: string
  status: DeliveryEpicStatus
}

export const DELIVERY_EPIC_TITLE_MAX_LENGTH = 180
export const DELIVERY_EPIC_SUMMARY_MAX_LENGTH = 4000

export function isDeliveryEpicStatus(value: string): value is DeliveryEpicStatus {
  return ['planned', 'active', 'blocked', 'completed', 'cancelled', 'archived'].includes(value)
}

export function validateDeliveryEpicUpdate(payload: {
  title: string
  summary: string
  status: string
}): string | null {
  const title = payload.title.trim()
  const summary = payload.summary.trim()

  if (!title) return 'Escribe un nombre para la épica.'
  if (title.length > DELIVERY_EPIC_TITLE_MAX_LENGTH) {
    return `El nombre debe tener ${DELIVERY_EPIC_TITLE_MAX_LENGTH} caracteres o menos.`
  }
  if (summary.length > DELIVERY_EPIC_SUMMARY_MAX_LENGTH) {
    return `El resumen debe tener ${DELIVERY_EPIC_SUMMARY_MAX_LENGTH} caracteres o menos.`
  }
  if (!isDeliveryEpicStatus(payload.status)) return 'Selecciona un estado válido para la épica.'

  return null
}

export function deliveryProjectEpicsPagePath(
  projectId: string,
  options: { status?: string; limit?: number; cursor?: string } = {}
): string {
  return apiPath(`${deliveryProjectPath(projectId)}/epics`, options)
}

export function deliveryProjectEpicsPath(projectId: string): string {
  return `${deliveryProjectPath(projectId)}/epics`
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value.trim())
}

export function deliveryEpicDetailPath(epicId: string, cursor?: string, tasksState?: string): string {
  return apiPath(`/automation/epics/${encodeSegment(epicId)}`, {
    tasks_limit: 20,
    tasks_cursor: cursor,
    tasks_state: tasksState || undefined,
  })
}

export function deliveryEpicUpdatePath(epicId: string): string {
  return `/automation/epics/${encodeSegment(epicId)}`
}

export function deliveryEpicWorkItemsPath(epicId: string): string {
  return `/automation/epics/${encodeSegment(epicId)}/work-items`
}

export function deliveryEpicWorkItemPath(epicId: string, workItemId: string): string {
  return `${deliveryEpicWorkItemsPath(epicId)}/${encodeSegment(workItemId)}`
}
