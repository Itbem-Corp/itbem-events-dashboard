import { apiPath } from '@/lib/api-paths'

export type DeliveryPlanStep = {
  id: string
  plan_id: string
  plan_version: number
  step_key: string
  order: number
  title: string
  objective: string
  acceptance_criteria: string[]
  evidence_requirements?: DeliveryPlanStepEvidenceRequirement[]
  depends_on: string[]
  status: string
  agent_key?: string
  automation_task_id?: string
  automation_execution_id?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export type DeliveryPlanStepEvidenceRequirement = {
  key: string
  title: string
  description?: string
  required: boolean
  content_types: string[]
  max_bytes: number
}

export type DeliveryPlanStepsSnapshot = {
  plan_id: string
  plan_version: number
  items: DeliveryPlanStep[]
  total: number
}

type ParseExpectation = {
  planId?: string
  planVersion?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

const allowedEvidenceContentTypes = new Set([
  'application/json',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/markdown',
  'text/plain',
])

function isEvidenceRequirement(value: unknown): value is DeliveryPlanStepEvidenceRequirement {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['key', 'title', 'description', 'required', 'content_types', 'max_bytes'].includes(key)
    )
  )
    return false
  const key = value.key
  const title = value.title
  const description = value.description
  return (
    typeof key === 'string' &&
    /^[a-z][a-z0-9_-]{0,47}$/.test(key) &&
    typeof title === 'string' &&
    title.trim().length > 0 &&
    title.length <= 120 &&
    (description === undefined || (typeof description === 'string' && description.length <= 400)) &&
    typeof value.required === 'boolean' &&
    Array.isArray(value.content_types) &&
    value.content_types.length > 0 &&
    value.content_types.length <= 6 &&
    value.content_types.every(
      (contentType) => typeof contentType === 'string' && allowedEvidenceContentTypes.has(contentType)
    ) &&
    new Set(value.content_types).size === value.content_types.length &&
    Number.isSafeInteger(value.max_bytes) &&
    Number(value.max_bytes) >= 1 &&
    Number(value.max_bytes) <= 1_048_576
  )
}

function isEvidenceRequirementArray(value: unknown): value is DeliveryPlanStepEvidenceRequirement[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(isEvidenceRequirement) &&
    new Set(value.map((requirement) => requirement.key)).size === value.length
  )
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isPlanStep(value: unknown): value is DeliveryPlanStep {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.plan_id === 'string' &&
    Number.isInteger(value.plan_version) &&
    typeof value.step_key === 'string' &&
    Number.isInteger(value.order) &&
    typeof value.title === 'string' &&
    typeof value.objective === 'string' &&
    isStringArray(value.acceptance_criteria) &&
    (value.evidence_requirements === undefined || isEvidenceRequirementArray(value.evidence_requirements)) &&
    isStringArray(value.depends_on) &&
    typeof value.status === 'string' &&
    optionalString(value.agent_key) &&
    optionalString(value.automation_task_id) &&
    optionalString(value.automation_execution_id) &&
    optionalString(value.started_at) &&
    optionalString(value.completed_at) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  )
}

export function deliveryPlanStepsPath(planId: string): string {
  return apiPath(`/automation/plans/${encodeURIComponent(planId.trim())}/steps`)
}

export function parseDeliveryPlanSteps(value: unknown, expectation: ParseExpectation = {}): DeliveryPlanStepsSnapshot {
  if (
    !isRecord(value) ||
    typeof value.plan_id !== 'string' ||
    !Number.isInteger(value.plan_version) ||
    !Array.isArray(value.items) ||
    !value.items.every(isPlanStep) ||
    !Number.isInteger(value.total) ||
    Number(value.total) < 0
  ) {
    throw new Error('La respuesta de pasos del plan no tiene el formato esperado.')
  }

  const snapshot = value as unknown as DeliveryPlanStepsSnapshot
  if (snapshot.items.some((step) => step.plan_id !== snapshot.plan_id || step.plan_version !== snapshot.plan_version)) {
    throw new Error('La respuesta mezcla pasos de versiones distintas del plan.')
  }
  if (expectation.planId && snapshot.plan_id !== expectation.planId) {
    throw new Error('La respuesta corresponde a otra versión del plan.')
  }
  if (expectation.planVersion !== undefined && snapshot.plan_version !== expectation.planVersion) {
    throw new Error('La respuesta corresponde a otra versión del plan.')
  }

  return snapshot
}
