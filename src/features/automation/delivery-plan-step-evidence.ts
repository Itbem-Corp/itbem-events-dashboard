import { apiPath } from '@/lib/api-paths'

export const DELIVERY_PLAN_STEP_EVIDENCE_PAGE_SIZE = 25
const maxCursorLength = 4096
const maxEvidenceBytes = 1_048_576

export type DeliveryPlanStepEvidenceItem = {
  id: string
  requirement_key: string
  file_name: string
  content_type: string
  size_bytes: number
  sha256: string
  source: string
  automation_task_id: string
  run_id: string
  agent_key: string
  agent_instance_id: string
  fencing_token: number
  created_at: string
}

export type DeliveryPlanStepEvidencePage = {
  plan_id: string
  plan_version: number
  step_id: string
  items: DeliveryPlanStepEvidenceItem[]
  next_cursor: string | null
}

export type DeliveryPlanStepEvidenceExpectation = {
  planId: string
  planVersion: number
  stepId: string
}

export type DeliveryPlanStepEvidenceQuery = {
  cursor?: string | null
  requirementKey?: string
  runId?: string
}

const itemKeys = new Set([
  'id',
  'requirement_key',
  'file_name',
  'content_type',
  'size_bytes',
  'sha256',
  'source',
  'automation_task_id',
  'run_id',
  'agent_key',
  'agent_instance_id',
  'fencing_token',
  'created_at',
])

const allowedEvidenceContentTypes = new Set([
  'application/json',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/markdown',
  'text/plain',
])

const sha256Pattern = /^[0-9a-f]{64}$/
const evidenceKeyPattern = /^[a-z][a-z0-9_-]{0,47}$/
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function parseItem(value: unknown): DeliveryPlanStepEvidenceItem | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !itemKeys.has(key))) return null
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    typeof value.requirement_key !== 'string' ||
    !evidenceKeyPattern.test(value.requirement_key) ||
    typeof value.file_name !== 'string' ||
    !fileNamePattern.test(value.file_name) ||
    value.file_name.includes('..') ||
    typeof value.content_type !== 'string' ||
    !allowedEvidenceContentTypes.has(value.content_type) ||
    !Number.isSafeInteger(value.size_bytes) ||
    Number(value.size_bytes) < 1 ||
    Number(value.size_bytes) > maxEvidenceBytes ||
    typeof value.sha256 !== 'string' ||
    !sha256Pattern.test(value.sha256) ||
    typeof value.source !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,31}$/.test(value.source) ||
    typeof value.automation_task_id !== 'string' ||
    !uuidPattern.test(value.automation_task_id) ||
    typeof value.run_id !== 'string' ||
    !uuidPattern.test(value.run_id) ||
    typeof value.agent_key !== 'string' ||
    value.agent_key.length === 0 ||
    value.agent_key.length > 64 ||
    typeof value.agent_instance_id !== 'string' ||
    !uuidPattern.test(value.agent_instance_id) ||
    !Number.isSafeInteger(value.fencing_token) ||
    Number(value.fencing_token) < 1 ||
    !validTimestamp(value.created_at)
  )
    return null

  return {
    id: value.id,
    requirement_key: value.requirement_key,
    file_name: value.file_name,
    content_type: value.content_type,
    size_bytes: value.size_bytes as number,
    sha256: value.sha256,
    source: value.source,
    automation_task_id: value.automation_task_id,
    run_id: value.run_id,
    agent_key: value.agent_key,
    agent_instance_id: value.agent_instance_id,
    fencing_token: value.fencing_token as number,
    created_at: value.created_at,
  }
}

export function deliveryPlanStepEvidencePath(
  planId: string,
  stepId: string,
  query: DeliveryPlanStepEvidenceQuery = {}
): string {
  const params: Record<string, string | number> = { limit: DELIVERY_PLAN_STEP_EVIDENCE_PAGE_SIZE }
  if (query.cursor) params.cursor = query.cursor
  if (query.requirementKey) params.requirement_key = query.requirementKey
  if (query.runId) params.run_id = query.runId
  return apiPath(
    `/automation/plans/${encodeURIComponent(planId.trim())}/steps/${encodeURIComponent(stepId.trim())}/evidence`,
    params
  )
}

export function deliveryPlanStepEvidenceContentPath(planId: string, stepId: string, evidenceId: string): string {
  return `/automation/plans/${encodeURIComponent(planId.trim())}/steps/${encodeURIComponent(stepId.trim())}/evidence/${encodeURIComponent(evidenceId.trim())}/content`
}

export function parseDeliveryPlanStepEvidence(
  value: unknown,
  expectation: DeliveryPlanStepEvidenceExpectation
): DeliveryPlanStepEvidencePage {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['plan_id', 'plan_version', 'step_id', 'items', 'next_cursor'].includes(key)) ||
    typeof value.plan_id !== 'string' ||
    !Number.isSafeInteger(value.plan_version) ||
    Number(value.plan_version) < 1 ||
    typeof value.step_id !== 'string' ||
    !Array.isArray(value.items) ||
    value.items.length > DELIVERY_PLAN_STEP_EVIDENCE_PAGE_SIZE ||
    !(
      value.next_cursor === null ||
      (typeof value.next_cursor === 'string' && value.next_cursor.length <= maxCursorLength)
    )
  )
    throw new Error('La respuesta de evidencias del paso no tiene el formato esperado.')

  const items = value.items.map(parseItem)
  if (items.some((item) => item === null)) {
    throw new Error('La respuesta incluye evidencia inválida o metadatos privados no permitidos.')
  }
  if (new Set((items as DeliveryPlanStepEvidenceItem[]).map((item) => item.id)).size !== items.length) {
    throw new Error('La respuesta repite identificadores de evidencia.')
  }
  if (
    value.plan_id !== expectation.planId ||
    value.plan_version !== expectation.planVersion ||
    value.step_id !== expectation.stepId
  )
    throw new Error('La evidencia recibida no corresponde a este plan y paso.')

  return {
    plan_id: value.plan_id,
    plan_version: value.plan_version as number,
    step_id: value.step_id,
    items: items as DeliveryPlanStepEvidenceItem[],
    next_cursor: value.next_cursor,
  }
}

export function formatEvidenceSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toLocaleString('es-MX', { maximumFractionDigits: 1 })} KB`
  return `${(sizeBytes / (1024 * 1024)).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MB`
}

export function abbreviatedEvidenceDigest(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`
}
