import type { DeliveryPolicyPatch, DeliveryPolicyRevision } from './delivery-types'

const digestPattern = /^[a-f0-9]{64}$/
const repositoryPattern = /^github:\/\/[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/
const workflowPattern = /^\.github\/workflows\/[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.ya?ml$/
const levels = new Set(['project', 'repository', 'override'])
const statuses = new Set(['pending', 'approved', 'revoked'])
const modes = new Set(['review_only', 'merge', 'release'])
const mergeMethods = new Set(['merge', 'squash', 'rebase'])
const recoveries = new Set(['rollback', 'roll_forward', 'expand_contract', 'irreversible'])
const privateIdentityKeys = new Set(['approved_by', 'proposed_by', 'actor_cognito_sub'])
const revisionKeys = new Set(['id', 'schema_version', 'level', 'project_id', 'repository', 'change_set_id', 'patch', 'reason', 'expires_at', 'content_sha256', 'created_at', 'status', 'latest_decision'])
const decisionKeys = new Set(['id', 'action', 'reason', 'occurred_at'])
const patchKeys = new Set(['mode', 'required_test_kinds', 'allowed_target_branches', 'merge_method', 'deployment_workflow', 'deployment_environment', 'required_health_checks', 'required_post_merge_checks', 'recovery_default'])

export type PolicyProposalDraft = {
  scope: 'project' | 'repository' | 'override'
  overrideScope: 'repository' | 'project'
  changeSetId: string
  expiresAt: string
  reason: string
  mode: '' | 'review_only' | 'merge' | 'release'
  requiredTestKinds: string
  allowedTargetBranches: string
  mergeMethod: '' | 'merge' | 'squash' | 'rebase'
  deploymentWorkflow: string
  deploymentEnvironment: string
  requiredHealthChecks: string
  requiredPostMergeChecks: string
  recoveryDefault: '' | 'rollback' | 'roll_forward' | 'expand_contract' | 'irreversible'
}

export const emptyPolicyProposalDraft: PolicyProposalDraft = {
  scope: 'repository', overrideScope: 'repository', changeSetId: '', expiresAt: '', reason: '', mode: '',
  requiredTestKinds: '', allowedTargetBranches: '', mergeMethod: '', deploymentWorkflow: '', deploymentEnvironment: '',
  requiredHealthChecks: '', requiredPostMergeChecks: '', recoveryDefault: '',
}

export function buildPolicyProposal(draft: PolicyProposalDraft, repository: string, now = new Date()) {
  if (!repositoryPattern.test(repository)) throw new Error('Selecciona un repositorio aprobado en Vault.')
  const reason = draft.reason.trim()
  if (!reason) throw new Error('Documenta la razón y el cambio esperado.')
  const patch: DeliveryPolicyPatch = {}
  if (draft.mode) patch.mode = draft.mode
  addList(patch, 'required_test_kinds', draft.requiredTestKinds)
  addList(patch, 'allowed_target_branches', draft.allowedTargetBranches)
  if (patch.allowed_target_branches?.some((branch) => branch.includes('*'))) throw new Error('Las ramas deben ser exactas; no se permiten wildcards.')
  if (draft.mergeMethod) patch.merge_method = draft.mergeMethod
  if (draft.deploymentWorkflow.trim()) {
    const workflow = draft.deploymentWorkflow.trim()
    if (!workflowPattern.test(workflow)) throw new Error('El workflow debe estar bajo .github/workflows/*.yml o *.yaml.')
    patch.deployment_workflow = workflow
  }
  if (draft.deploymentEnvironment.trim()) patch.deployment_environment = draft.deploymentEnvironment.trim()
  addList(patch, 'required_health_checks', draft.requiredHealthChecks)
  addList(patch, 'required_post_merge_checks', draft.requiredPostMergeChecks)
  if (draft.recoveryDefault) patch.recovery_default = draft.recoveryDefault
  if (Object.keys(patch).length === 0) throw new Error('Configura al menos un campo de política.')

  const proposal: {
    level: PolicyProposalDraft['scope']
    repository?: string
    change_set_id?: string
    patch: DeliveryPolicyPatch
    reason: string
    expires_at?: string
  } = { level: draft.scope, patch, reason }
  if (draft.scope === 'repository' || (draft.scope === 'override' && draft.overrideScope === 'repository')) proposal.repository = repository
  if (draft.scope === 'override') {
    proposal.change_set_id = draft.changeSetId.trim()
    if (!proposal.change_set_id) throw new Error('El override requiere un change-set exacto.')
    const expiresAt = new Date(draft.expiresAt)
    const lifetime = expiresAt.getTime() - now.getTime()
    if (Number.isNaN(expiresAt.getTime()) || lifetime <= 0 || lifetime > 24 * 60 * 60 * 1000) throw new Error('El override debe expirar dentro de las próximas 24 horas.')
    proposal.expires_at = expiresAt.toISOString()
  }
  return proposal
}

export function normalizePolicyRevisions(input: unknown, expectedProjectId: string): DeliveryPolicyRevision[] | null {
  if (!Array.isArray(input) || containsPrivateIdentity(input)) return null
  const result: DeliveryPolicyRevision[] = []
  for (const value of input) {
    if (!isRecord(value) || !onlyKeys(value, revisionKeys) || value.schema_version !== 1 || value.project_id !== expectedProjectId) return null
    if (!nonEmpty(value.id) || !nonEmpty(value.level) || !levels.has(value.level) || !nonEmpty(value.status) || !statuses.has(value.status)) return null
    if (!digestPattern.test(stringValue(value.content_sha256)) || !validDate(value.created_at) || !validPatch(value.patch)) return null
    const level = value.level
    const repository = value.repository
    const changeSetId = value.change_set_id
    if (level === 'project' && (repository !== undefined || changeSetId !== undefined || value.expires_at !== undefined)) return null
    if (level === 'repository' && (!nonEmpty(repository) || !repositoryPattern.test(repository) || changeSetId !== undefined || value.expires_at !== undefined)) return null
    if (level === 'override') {
      if (repository !== undefined && (!nonEmpty(repository) || !repositoryPattern.test(repository))) return null
      if (!nonEmpty(changeSetId) || !nonEmpty(value.reason) || !validDate(value.expires_at)) return null
    }
    const decision = value.latest_decision
    if (value.status === 'pending') {
      if (decision !== undefined) return null
    } else if (!validDecision(decision, value.status)) {
      return null
    }
    result.push(value as DeliveryPolicyRevision)
  }
  return result
}

export function policyRevisionsForRepository(revisions: DeliveryPolicyRevision[], repository: string) {
  return revisions.filter((revision) => revision.level === 'project' || revision.repository === repository || (revision.level === 'override' && !revision.repository))
}

function addList<Key extends 'required_test_kinds' | 'allowed_target_branches' | 'required_health_checks' | 'required_post_merge_checks'>(patch: DeliveryPolicyPatch, key: Key, raw: string) {
  const values = uniqueList(raw)
  if (values.length > 0) patch[key] = values
}

function uniqueList(raw: string) {
  const values: string[] = []
  const seen = new Set<string>()
  for (const candidate of raw.split(',')) {
    const value = candidate.trim()
    if (value && !seen.has(value)) {
      seen.add(value)
      values.push(value)
    }
  }
  return values
}

function validPatch(input: unknown): input is DeliveryPolicyPatch {
  if (!isRecord(input) || !onlyKeys(input, patchKeys)) return false
  if (input.mode !== undefined && (!nonEmpty(input.mode) || !modes.has(input.mode))) return false
  if (input.merge_method !== undefined && (!nonEmpty(input.merge_method) || !mergeMethods.has(input.merge_method))) return false
  if (input.recovery_default !== undefined && (!nonEmpty(input.recovery_default) || !recoveries.has(input.recovery_default))) return false
  for (const value of [input.required_test_kinds, input.allowed_target_branches, input.required_health_checks, input.required_post_merge_checks]) {
    if (value !== undefined && !stringList(value)) return false
  }
  if (input.deployment_workflow !== undefined && (!nonEmpty(input.deployment_workflow) || !workflowPattern.test(input.deployment_workflow))) return false
  if (input.deployment_environment !== undefined && !nonEmpty(input.deployment_environment)) return false
  return true
}

function validDecision(input: unknown, status: unknown) {
  if (!isRecord(input) || !onlyKeys(input, decisionKeys) || !nonEmpty(input.id) || input.action !== status || !validDate(input.occurred_at)) return false
  return input.action !== 'revoked' || nonEmpty(input.reason)
}

function containsPrivateIdentity(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsPrivateIdentity)
  if (!isRecord(input)) return false
  for (const [key, value] of Object.entries(input)) {
    if (privateIdentityKeys.has(key) || containsPrivateIdentity(value)) return true
  }
  return false
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function onlyKeys(input: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(input).every((key) => allowed.has(key))
}

function nonEmpty(input: unknown): input is string {
  return typeof input === 'string' && input.trim() === input && input.length > 0
}

function stringValue(input: unknown) { return typeof input === 'string' ? input : '' }
function stringList(input: unknown): input is string[] { return Array.isArray(input) && input.every(nonEmpty) }
function validDate(input: unknown) { return nonEmpty(input) && !Number.isNaN(Date.parse(input)) }
