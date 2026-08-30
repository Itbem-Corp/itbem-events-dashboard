import type { DeliveryEffectivePolicySnapshot, DeliveryPolicySafetyFloor } from './delivery-types'

const digestPattern = /^[a-f0-9]{64}$/
const commitPattern = /^[a-f0-9]{40}$/
const modes = new Set(['review_only', 'merge', 'release'])
const mergeMethods = new Set(['merge', 'squash', 'rebase'])
const recoveries = new Set(['rollback', 'roll_forward', 'expand_contract', 'irreversible'])
const levels = new Set(['platform', 'organization', 'project', 'repository', 'override'])

export const effectivePolicyMissingLabels: Record<string, string> = {
  mode: 'Modo de entrega',
  required_test_kinds: 'Pruebas obligatorias',
  allowed_target_branches: 'Ramas destino',
  merge_method: 'Método de merge',
  deployment_workflow: 'Workflow de despliegue',
  deployment_environment: 'Entorno de despliegue',
  required_health_checks: 'Health checks',
  recovery_default: 'Estrategia de recuperación',
}

export function effectivePolicyModeLabel(mode?: DeliveryEffectivePolicySnapshot['policy']['mode']) {
  if (mode === 'review_only') return 'Sólo revisión'
  if (mode === 'merge') return 'Merge controlado'
  if (mode === 'release') return 'Release controlado'
  return 'Sin resolver'
}

export function normalizeEffectivePolicySnapshot(
  input: unknown,
  expectedProjectId: string,
  expectedRepository: string
): DeliveryEffectivePolicySnapshot | null {
  if (containsPrivateIdentity(input)) return null
  if (!isRecord(input) || input.schema_version !== 1 || input.project_id !== expectedProjectId || input.repository !== expectedRepository) return null
  if (typeof input.overrides_considered !== 'boolean' || !validDate(input.evaluated_at) || !isRecord(input.vault) || !isRecord(input.policy)) return null
  const vault = input.vault
  if (!nonEmpty(vault.revision_id) || !positiveInteger(vault.version) || !commitPattern.test(stringValue(vault.repository_sha)) || !digestPattern.test(stringValue(vault.content_sha256))) return null
  const policy = input.policy
  if (policy.schema_version !== 1 || typeof policy.resolved !== 'boolean' || !digestPattern.test(stringValue(policy.digest))) return null
  if (!stringList(policy.required_test_kinds) || !stringList(policy.allowed_target_branches) || !stringList(policy.required_health_checks) || !stringList(policy.required_post_merge_checks) || !stringList(policy.missing)) return null
  if (policy.mode !== undefined && (!nonEmpty(policy.mode) || !modes.has(policy.mode))) return null
  if (policy.merge_method !== undefined && (!nonEmpty(policy.merge_method) || !mergeMethods.has(policy.merge_method))) return null
  if (policy.recovery_default !== undefined && (!nonEmpty(policy.recovery_default) || !recoveries.has(policy.recovery_default))) return null
  for (const optional of [policy.deployment_workflow, policy.deployment_environment]) {
    if (optional !== undefined && !nonEmpty(optional)) return null
  }
  if (!validSafety(policy.safety) || !Array.isArray(policy.sources)) return null
  for (const source of policy.sources) {
    if (!isRecord(source) || !nonEmpty(source.level) || !levels.has(source.level) || !nonEmpty(source.revision_id) || !digestPattern.test(stringValue(source.digest)) || !validDate(source.approved_at)) return null
  }
  if (input.change_set_id !== undefined && !nonEmpty(input.change_set_id)) return null
  return input as DeliveryEffectivePolicySnapshot
}

function validSafety(input: unknown): input is DeliveryPolicySafetyFloor {
  if (!isRecord(input)) return false
  for (const key of ['independent_review', 'exact_sha_evidence', 'vault_reconciliation', 'secret_scan', 'compatibility', 'migrations', 'dependency_order', 'environment', 'recovery', 'human_approval', 'force_merge_allowed']) {
    if (key === 'force_merge_allowed' ? input[key] !== false : input[key] !== true) return false
  }
  return input.maximum_high_findings === 0 && input.maximum_critical_findings === 0 && input.force_merge_allowed === false
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function nonEmpty(input: unknown): input is string {
  return typeof input === 'string' && input.trim() === input && input.length > 0
}

function stringValue(input: unknown) {
  return typeof input === 'string' ? input : ''
}

function stringList(input: unknown): input is string[] {
  return Array.isArray(input) && input.every(nonEmpty)
}

function positiveInteger(input: unknown) {
  return typeof input === 'number' && Number.isSafeInteger(input) && input > 0
}

function validDate(input: unknown) {
  return nonEmpty(input) && !Number.isNaN(Date.parse(input))
}

function containsPrivateIdentity(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsPrivateIdentity)
  if (!isRecord(input)) return false
  for (const [key, value] of Object.entries(input)) {
    if (key === 'approved_by' || key === 'proposed_by' || key === 'actor_cognito_sub') return true
    if (containsPrivateIdentity(value)) return true
  }
  return false
}
