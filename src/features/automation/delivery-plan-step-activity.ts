import { apiPath } from '@/lib/api-paths'

export const DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE = 25

export type DeliveryPlanStepAcceptanceCheck = {
  criterion_sha256: string
  passed: boolean
}

export type DeliveryPlanStepPatchArtifactReference = {
  repository_ref: string
  base_sha: string
  sha256: string
  size_bytes: number
}

export type DeliveryPlanStepActivityEvidenceDetails = {
  acceptance_checks?: DeliveryPlanStepAcceptanceCheck[]
  review_diff_sha256?: string
  patch_artifacts?: DeliveryPlanStepPatchArtifactReference[]
}

export type DeliveryPlanStepActivityDetails = DeliveryPlanStepActivityEvidenceDetails & {
  executable_name?: string
  argument_count?: number
  exit_code?: number
  captured_output_bytes?: number
  resource_references?: string[]
  changed_files?: string[]
  applied_dependency_manifest_sha256?: string
  applied_dependency_patch_count?: number
}

export type DeliveryPlanStepInferenceAccounting = {
  provider: string | null
  model: string | null
  status: 'accepted' | 'rejected' | null
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
  cache_write_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
  total_cost_microusd: number | null
  currency: string | null
  pricing_basis: 'official_api_price' | 'unpriced' | null
}

export type DeliveryPlanStepActivityItem = {
  id: string
  sequence: number
  action: string
  phase: string
  tool_name: string | null
  automation_task_id: string | null
  run_id: string | null
  worker_id: string | null
  agent_key: string | null
  machine_id: string | null
  agent_instance_id: string | null
  details: DeliveryPlanStepActivityDetails | null
  inference: DeliveryPlanStepInferenceAccounting | null
  duration_ms: number | null
  summary: string
  occurred_at: string
}

export type DeliveryPlanStepActivityPage = {
  plan_id: string
  plan_version: number
  step_id: string
  items: DeliveryPlanStepActivityItem[]
  next_cursor: string | null
}

type ParseExpectation = {
  planId: string
  planVersion: number
  stepId: string
}

const itemKeys = new Set([
  'id',
  'sequence',
  'action',
  'phase',
  'tool_name',
  'automation_task_id',
  'run_id',
  'worker_id',
  'agent_key',
  'machine_id',
  'agent_instance_id',
  'details',
  'inference',
  'duration_ms',
  'summary',
  'occurred_at',
])

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const providerPattern = /^(?:deepseek|minimax|openai|openrouter)$/
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/
const sha256Pattern = /^[0-9a-f]{64}$/
const commitShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const maxPatchArtifactCount = 6
const maxPatchArtifactBytes = 4 * 1024 * 1024
const maxActivityDetailsBytes = 4 * 1024

const detailsKeys = new Set([
  'executable_name',
  'argument_count',
  'exit_code',
  'captured_output_bytes',
  'resource_references',
  'changed_files',
  'acceptance_checks',
  'review_diff_sha256',
  'patch_artifacts',
  'applied_dependency_manifest_sha256',
  'applied_dependency_patch_count',
])

const safeExecutables = new Set([
  'cargo',
  'docker',
  'dotnet',
  'git',
  'go',
  'make',
  'node',
  'npm',
  'npx',
  'powershell',
  'pwsh',
  'pytest',
  'python',
  'python3',
  'pnpm',
  'yarn',
])

const actionLabels: Record<string, string> = {
  activity: 'Actividad',
  agent_started: 'Agente iniciado',
  agent_finished: 'Agente finalizado',
  inference: 'Inferencia de IA',
  inference_requested: 'Inferencia solicitada',
  inference_completed: 'Inferencia completada',
  tool: 'Herramienta',
  tool_call: 'Llamada a herramienta',
  tool_started: 'Herramienta iniciada',
  tool_completed: 'Herramienta completada',
  tool_failed: 'Herramienta fallida',
  file_read: 'Lectura de archivo',
  file_change: 'Cambio de archivo',
  file_created: 'Archivo creado',
  file_updated: 'Archivo actualizado',
  file_deleted: 'Archivo eliminado',
  command: 'Comando',
  command_started: 'Comando iniciado',
  command_completed: 'Comando completado',
  command_failed: 'Comando fallido',
  validation: 'Validación',
  evidence: 'Evidencia',
  evidence_recorded: 'Evidencia registrada',
  checkpoint_saved: 'Punto de control guardado',
}

const phaseLabels: Record<string, string> = {
  queued: 'En cola',
  started: 'Iniciada',
  running: 'En curso',
  request: 'Solicitud',
  response: 'Respuesta',
  completed: 'Completada',
  succeeded: 'Correcta',
  failed: 'Fallida',
  blocked: 'Bloqueada',
  skipped: 'Omitida',
  recorded: 'Registrada',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function isNullableUUID(value: unknown): value is string | null | undefined {
  return isNullableString(value) && (value === undefined || value === null || uuidPattern.test(value))
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}

function nullableCounter(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  return isBoundedInteger(value, 0, Number.MAX_SAFE_INTEGER) ? value : undefined
}

function parseInferenceAccounting(
  value: unknown,
  action: string,
  phase: string
): DeliveryPlanStepInferenceAccounting | null | undefined {
  if (value === undefined || value === null) return null
  if (action !== 'inference' || (phase !== 'completed' && phase !== 'failed')) return undefined
  const allowedKeys = new Set([
    'receipt_id',
    'provider',
    'model',
    'status',
    'input_tokens',
    'output_tokens',
    'cached_input_tokens',
    'cache_write_tokens',
    'reasoning_tokens',
    'total_tokens',
    'total_cost_microusd',
    'currency',
    'pricing_basis',
  ])
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) return undefined
  if (typeof value.receipt_id !== 'string' || !uuidPattern.test(value.receipt_id)) return undefined

  const counters = {
    input_tokens: nullableCounter(value.input_tokens),
    output_tokens: nullableCounter(value.output_tokens),
    cached_input_tokens: nullableCounter(value.cached_input_tokens),
    cache_write_tokens: nullableCounter(value.cache_write_tokens),
    reasoning_tokens: nullableCounter(value.reasoning_tokens),
    total_tokens: nullableCounter(value.total_tokens),
    total_cost_microusd: nullableCounter(value.total_cost_microusd),
  }
  if (Object.values(counters).some((counter) => counter === undefined)) return undefined

  const provider =
    typeof value.provider === 'string' && providerPattern.test(value.provider) ? value.provider : null
  const model = typeof value.model === 'string' && modelPattern.test(value.model) ? value.model : null
  const status = value.status === 'accepted' || value.status === 'rejected' ? value.status : null
  const currency = typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) ? value.currency : null
  const pricingBasis =
    value.pricing_basis === 'official_api_price' || value.pricing_basis === 'unpriced'
      ? value.pricing_basis
      : null

  return {
    provider,
    model,
    status,
    input_tokens: counters.input_tokens as number | null,
    output_tokens: counters.output_tokens as number | null,
    cached_input_tokens: counters.cached_input_tokens as number | null,
    cache_write_tokens: counters.cache_write_tokens as number | null,
    reasoning_tokens: counters.reasoning_tokens as number | null,
    total_tokens: counters.total_tokens as number | null,
    total_cost_microusd: counters.total_cost_microusd as number | null,
    currency,
    pricing_basis: pricingBasis,
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isSafeRelativePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    utf8ByteLength(value) > 256 ||
    value.startsWith('/') ||
    /[\\:\u0000-\u001f\u007f]/.test(value)
  )
    return false

  const segments = value.split('/')
  return segments.every((segment) => {
    const lower = segment.toLocaleLowerCase('en-US')
    const sensitiveKeyFile = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'].some((prefix) =>
      lower.startsWith(prefix)
    )
    return (
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      lower !== '.git' &&
      !lower.startsWith('.env') &&
      ![
        '.aws',
        '.docker',
        '.gcloud',
        '.kube',
        '.ssh',
        '.npmrc',
        '.pypirc',
        '.netrc',
        '.dockercfg',
        '.htpasswd',
        '.pgpass',
        'kubeconfig',
        'terraform.tfstate',
      ].includes(lower) &&
      !['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.cer', '.crt', '.der'].includes(
        lower.slice(lower.lastIndexOf('.'))
      ) &&
      ![
        'credential',
        'secret',
        'private_key',
        'api_key',
        'apikey',
        'access_key',
        'token',
        'password',
        'service_account',
      ].some((sensitive) => lower.includes(sensitive)) && !sensitiveKeyFile
    )
  })
}

function isSafeResourceReference(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('workspace://') ||
    utf8ByteLength(value) > 256 ||
    /[\\?#%\u0000-\u001f\u007f]/.test(value)
  )
    return false
  const [, workspaceId, relativePath] = value.match(/^workspace:\/\/([A-Za-z0-9_.-]{1,96})(?:\/(.*))?$/) ?? []
  return Boolean(
    workspaceId &&
      workspaceId !== '.' &&
      workspaceId !== '..' &&
      (relativePath === undefined || isSafeRelativePath(relativePath))
  )
}

function isSafePatchRepositoryReference(value: unknown): value is string {
  if (!isSafeResourceReference(value) || !value.startsWith('workspace://')) return false
  return !value.slice('workspace://'.length).includes('/')
}

function parseActivityDetails(
  value: unknown,
  action: string,
  phase: string
): DeliveryPlanStepActivityDetails | null | undefined {
  if (value === undefined || value === null) return null
  if (!isRecord(value) || Object.keys(value).some((key) => !detailsKeys.has(key))) return undefined
  try {
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string' || utf8ByteLength(serialized) > maxActivityDetailsBytes) return undefined
  } catch {
    return undefined
  }
  if (phase !== 'completed' && phase !== 'failed') return undefined

  const hasExecutable = Object.hasOwn(value, 'executable_name')
  const commandFieldNames = ['argument_count', 'exit_code', 'captured_output_bytes'] as const
  const hasAnyCommandField = hasExecutable || commandFieldNames.some((key) => Object.hasOwn(value, key))
  let commandDetails:
    | Pick<
        DeliveryPlanStepActivityDetails,
        'executable_name' | 'argument_count' | 'exit_code' | 'captured_output_bytes'
      >
    | undefined
  if (hasAnyCommandField) {
    if (
      (action !== 'command' && action !== 'validation') ||
      !hasExecutable ||
      typeof value.executable_name !== 'string' ||
      !safeExecutables.has(value.executable_name) ||
      !isBoundedInteger(value.argument_count, 0, 128) ||
      !isBoundedInteger(value.exit_code, 0, 255) ||
      !isBoundedInteger(value.captured_output_bytes, 0, 24_000)
    )
      return undefined

    commandDetails = {
      executable_name: value.executable_name,
      argument_count: value.argument_count,
      exit_code: value.exit_code,
      captured_output_bytes: value.captured_output_bytes,
    }
  }

  let changedFiles: string[] | undefined
  if (Object.hasOwn(value, 'changed_files')) {
    if (
      action !== 'file_change' ||
      !Array.isArray(value.changed_files) ||
      value.changed_files.length === 0 ||
      value.changed_files.length > 50 ||
      !value.changed_files.every(isSafeRelativePath) ||
      new Set(value.changed_files).size !== value.changed_files.length
    )
      return undefined
    changedFiles = value.changed_files
  }

  let resourceReferences: string[] | undefined
  if (Object.hasOwn(value, 'resource_references')) {
    if (
      !['file_read', 'file_change', 'command', 'validation', 'evidence'].includes(action) ||
      !Array.isArray(value.resource_references) ||
      value.resource_references.length === 0 ||
      value.resource_references.length > 16 ||
      !value.resource_references.every(isSafeResourceReference) ||
      new Set(value.resource_references).size !== value.resource_references.length
    )
      return undefined
    resourceReferences = value.resource_references
  }

  const hasAcceptanceChecks = Object.hasOwn(value, 'acceptance_checks')
  const hasReviewDiff = Object.hasOwn(value, 'review_diff_sha256')
  const hasPatchArtifacts = Object.hasOwn(value, 'patch_artifacts')
  const hasDependencyManifestSHA256 = Object.hasOwn(value, 'applied_dependency_manifest_sha256')
  const hasDependencyPatchCount = Object.hasOwn(value, 'applied_dependency_patch_count')
  const hasDependencyManifestDetails = hasDependencyManifestSHA256 || hasDependencyPatchCount
  if (hasAcceptanceChecks || hasReviewDiff || hasPatchArtifacts) {
    if (action !== 'evidence' || phase !== 'completed') return undefined
  }

  let appliedDependencyManifestSHA256: string | undefined
  let appliedDependencyPatchCount: number | undefined
  if (hasDependencyManifestDetails) {
    if (
      action !== 'evidence' ||
      phase !== 'completed' ||
      !hasDependencyManifestSHA256 ||
      !hasDependencyPatchCount ||
      typeof value.applied_dependency_manifest_sha256 !== 'string' ||
      !sha256Pattern.test(value.applied_dependency_manifest_sha256) ||
      !isBoundedInteger(value.applied_dependency_patch_count, 0, 64)
    )
      return undefined
    appliedDependencyManifestSHA256 = value.applied_dependency_manifest_sha256
    appliedDependencyPatchCount = value.applied_dependency_patch_count
  }

  let acceptanceChecks: DeliveryPlanStepAcceptanceCheck[] | undefined
  if (hasAcceptanceChecks) {
    if (
      !Array.isArray(value.acceptance_checks) ||
      value.acceptance_checks.length === 0 ||
      value.acceptance_checks.length > 100
    )
      return undefined
    const parsedChecks: DeliveryPlanStepAcceptanceCheck[] = []
    for (const check of value.acceptance_checks) {
      if (
        !isRecord(check) ||
        Object.keys(check).some((key) => key !== 'criterion_sha256' && key !== 'passed') ||
        typeof check.criterion_sha256 !== 'string' ||
        !sha256Pattern.test(check.criterion_sha256) ||
        typeof check.passed !== 'boolean'
      )
        return undefined
      parsedChecks.push({ criterion_sha256: check.criterion_sha256, passed: check.passed })
    }
    acceptanceChecks = parsedChecks
  }

  let reviewDiffSHA256: string | undefined
  if (hasReviewDiff) {
    if (typeof value.review_diff_sha256 !== 'string' || !sha256Pattern.test(value.review_diff_sha256)) return undefined
    reviewDiffSHA256 = value.review_diff_sha256
  }

  let patchArtifacts: DeliveryPlanStepPatchArtifactReference[] | undefined
  if (hasPatchArtifacts) {
    if (
      !Array.isArray(value.patch_artifacts) ||
      value.patch_artifacts.length === 0 ||
      value.patch_artifacts.length > maxPatchArtifactCount
    )
      return undefined
    const parsedArtifacts: DeliveryPlanStepPatchArtifactReference[] = []
    const seenDigests = new Set<string>()
    for (const artifact of value.patch_artifacts) {
      if (
        !isRecord(artifact) ||
        Object.keys(artifact).some((key) => !['repository_ref', 'base_sha', 'sha256', 'size_bytes'].includes(key)) ||
        !isSafePatchRepositoryReference(artifact.repository_ref) ||
        typeof artifact.base_sha !== 'string' ||
        !commitShaPattern.test(artifact.base_sha) ||
        typeof artifact.sha256 !== 'string' ||
        !sha256Pattern.test(artifact.sha256) ||
        !isBoundedInteger(artifact.size_bytes, 1, maxPatchArtifactBytes) ||
        seenDigests.has(artifact.sha256)
      )
        return undefined
      seenDigests.add(artifact.sha256)
      parsedArtifacts.push({
        repository_ref: artifact.repository_ref,
        base_sha: artifact.base_sha,
        sha256: artifact.sha256,
        size_bytes: artifact.size_bytes,
      })
    }
    patchArtifacts = parsedArtifacts
  }

  const hasSafeDetails =
    hasAnyCommandField ||
    Object.hasOwn(value, 'changed_files') ||
    Object.hasOwn(value, 'resource_references') ||
    hasAcceptanceChecks ||
    hasReviewDiff ||
    hasPatchArtifacts ||
    hasDependencyManifestDetails
  if (!hasSafeDetails) return undefined

  if (action === 'evidence' && (hasAnyCommandField || Object.hasOwn(value, 'changed_files'))) return undefined
  if (action !== 'evidence' && (hasAcceptanceChecks || hasReviewDiff || hasPatchArtifacts)) return undefined

  return {
    ...(commandDetails ?? {}),
    ...(resourceReferences ? { resource_references: resourceReferences } : {}),
    ...(changedFiles ? { changed_files: changedFiles } : {}),
    ...(acceptanceChecks ? { acceptance_checks: acceptanceChecks } : {}),
    ...(reviewDiffSHA256 ? { review_diff_sha256: reviewDiffSHA256 } : {}),
    ...(patchArtifacts ? { patch_artifacts: patchArtifacts } : {}),
    ...(appliedDependencyManifestSHA256
      ? { applied_dependency_manifest_sha256: appliedDependencyManifestSHA256 }
      : {}),
    ...(appliedDependencyPatchCount !== undefined ? { applied_dependency_patch_count: appliedDependencyPatchCount } : {}),
  }
}

function parseActivityItem(value: unknown): DeliveryPlanStepActivityItem | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !itemKeys.has(key))) return null
  if (typeof value.action !== 'string' || typeof value.phase !== 'string') return null
  const occurredAt = typeof value.occurred_at === 'string' ? Date.parse(value.occurred_at) : Number.NaN
  const details = parseActivityDetails(value.details, value.action, value.phase)
  const inference = parseInferenceAccounting(value.inference, value.action, value.phase)
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    typeof value.action !== 'string' ||
    value.action.length === 0 ||
    typeof value.phase !== 'string' ||
    value.phase.length === 0 ||
    !isNullableString(value.tool_name) ||
    typeof value.automation_task_id !== 'string' ||
    typeof value.run_id !== 'string' ||
    typeof value.worker_id !== 'string' ||
    typeof value.agent_key !== 'string' ||
    !isNullableString(value.machine_id) ||
    !isNullableUUID(value.agent_instance_id) ||
    details === undefined ||
    inference === undefined ||
    !(
      value.duration_ms === undefined ||
      value.duration_ms === null ||
      (Number.isSafeInteger(value.duration_ms) && (value.duration_ms as number) >= 0)
    ) ||
    typeof value.summary !== 'string' ||
    !Number.isFinite(occurredAt)
  )
    return null

  return {
    id: value.id,
    sequence: value.sequence as number,
    action: value.action,
    phase: value.phase,
    tool_name: value.tool_name ?? null,
    automation_task_id: value.automation_task_id,
    run_id: value.run_id,
    worker_id: value.worker_id,
    agent_key: value.agent_key,
    machine_id: value.machine_id ?? null,
    agent_instance_id: value.agent_instance_id ?? null,
    details,
    inference,
    duration_ms: (value.duration_ms ?? null) as number | null,
    summary: value.summary,
    occurred_at: value.occurred_at as string,
  }
}

export function deliveryPlanStepActivityPath(planId: string, stepId: string, cursor?: string | null): string {
  const query: Record<string, string | number> = { limit: DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE }
  if (cursor) query.cursor = cursor
  return apiPath(
    `/automation/plans/${encodeURIComponent(planId.trim())}/steps/${encodeURIComponent(stepId.trim())}/activity`,
    query
  )
}

export function parseDeliveryPlanStepActivity(
  value: unknown,
  expectation: ParseExpectation
): DeliveryPlanStepActivityPage {
  if (
    !isRecord(value) ||
    typeof value.plan_id !== 'string' ||
    !Number.isInteger(value.plan_version) ||
    typeof value.step_id !== 'string' ||
    !Array.isArray(value.items) ||
    !(value.next_cursor === null || typeof value.next_cursor === 'string')
  )
    throw new Error('La respuesta de actividad del paso no tiene el formato esperado.')

  const items = value.items.map(parseActivityItem)
  if (items.some((item) => item === null)) {
    throw new Error('La respuesta de actividad del paso contiene un registro inválido o campos no permitidos.')
  }

  if (
    value.plan_id !== expectation.planId ||
    value.plan_version !== expectation.planVersion ||
    value.step_id !== expectation.stepId
  )
    throw new Error('La actividad recibida no corresponde a este plan y paso.')

  return {
    plan_id: value.plan_id,
    plan_version: value.plan_version as number,
    step_id: value.step_id,
    items: items as DeliveryPlanStepActivityItem[],
    next_cursor: value.next_cursor,
  }
}

function fallbackLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es-MX'))
}

export function deliveryPlanStepActivityActionLabel(action: string): string {
  return actionLabels[action] ?? fallbackLabel(action)
}

export function deliveryPlanStepActivityPhaseLabel(phase: string): string {
  return phaseLabels[phase] ?? fallbackLabel(phase)
}
