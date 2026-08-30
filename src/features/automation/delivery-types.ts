export type DeliveryTaskStatus =
  'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'completed' | 'failed' | 'dispatch_failed'

export type DeliveryAutomationTask = {
  id: string
  operation: string
  max_completion_tokens?: number
  status: DeliveryTaskStatus
  output_ref?: string
  provider?: string
  model?: string
  usage?: { total_tokens?: number }
  error_message?: string
  created_at: string
  completed_at?: string
}

export type DeliveryContextSource = {
  id: string
  kind: 'repository' | 'document' | 'design' | 'client_conversation' | 'decision' | 'runbook' | 'environment'
  name: string
  reference: string
  revision: string
  status: string
  metadata?: Record<string, unknown>
  synced_at?: string
}

export type DeliveryVaultProvenance = {
  source: 'github_api' | 'static_inventory' | 'structured_manifest' | string
  path: string
  revision: string
  confidence: number
}

export type DeliveryRepositoryCapability = {
  name:
    | 'source'
    | 'branch_write'
    | 'pr_write'
    | 'review'
    | 'unit'
    | 'integration'
    | 'contract'
    | 'e2e'
    | 'preview'
    | 'staging'
    | 'release'
    | 'health'
    | 'recovery'
    | 'vault'
  state: 'ready' | 'proposed' | 'unknown' | 'blocked' | 'unavailable'
  reason: string
  evidence?: DeliveryVaultProvenance[]
}

export type DeliveryVaultEntry = {
  key: string
  kind: string
  lifecycle: 'active' | 'deprecated' | 'removed'
  lifecycle_sha?: string
  valid_from_sha?: string
  valid_through_sha?: string
  value: Record<string, unknown>
  provenance: DeliveryVaultProvenance[]
  history?: DeliveryVaultHistoryEntry[]
  history_truncated?: boolean
}

export type DeliveryVaultHistoryEntry = {
  kind: string
  lifecycle: 'deprecated' | 'removed'
  value: Record<string, unknown>
  provenance: DeliveryVaultProvenance[]
  valid_from_sha: string
  valid_through_sha: string
  transition_sha: string
}

export type DeliveryVaultManifest = {
  schema_version: number
  scope: 'repository' | 'project'
  repository: { reference: string; default_branch: string; revision: string }
  entries: DeliveryVaultEntry[]
  history_truncated?: boolean
}

export type DeliveryVaultDiff = {
  added: string[]
  modified: string[]
  unchanged: string[]
  removed: string[]
}

export type DeliveryRepositoryOnboardingProposal = {
  schema_version: number
  repository: { reference: string; default_branch: string; revision: string }
  readiness: 'ready' | 'partially_ready' | 'blocked'
  trust_boundary: 'repository_content_is_untrusted_data'
  inventory_file_count: number
  inventory_truncated: boolean
  stacks: Array<{ name: string; confidence: number; provenance: DeliveryVaultProvenance[] }>
  commands: Array<{
    capability: string
    working_directory: string
    command: string[]
    status: 'proposed_not_executed'
    provenance: DeliveryVaultProvenance
  }>
  capabilities: DeliveryRepositoryCapability[]
  vault: DeliveryVaultManifest
  vault_sha256: string
  previous_revision?: string
  previous_vault_sha256?: string
  vault_diff?: DeliveryVaultDiff
}

export type DeliveryRepositoryOnboarding = {
  id: string
  project_id: string
  repository_reference: string
  default_branch: string
  revision: string
  status: 'proposed' | 'approved' | 'blocked' | 'superseded'
  readiness: 'ready' | 'partially_ready' | 'blocked'
  proposal_sha256: string
  vault_sha256: string
  proposed_by: string
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
  proposal: DeliveryRepositoryOnboardingProposal
  capability_matrix: DeliveryRepositoryCapability[]
}

export type DeliveryRepositoryCapabilityProbe = {
  id: string
  project_id: string
  onboarding_id: string
  automation_task_id: string
  repository_reference: string
  revision: string
  capability: 'unit' | 'integration' | 'contract' | 'e2e' | 'preview' | 'staging' | 'health' | 'recovery'
  state: 'ready' | 'blocked'
  executor_role: 'qa' | 'release' | 'orchestrator'
  evidence_sha256: string
  subject_sha256: string
  reason: string
  observed_at: string
  created_at: string
}

export type DeliveryRepositoryCapabilityProbeTask = {
  id: string
  status: DeliveryTaskStatus
  attempt_count: number
  completed_at?: string
  created_at: string
}

export type DeliveryRepositoryCapabilityProbeFeed = {
  probes: DeliveryRepositoryCapabilityProbe[]
  tasks: DeliveryRepositoryCapabilityProbeTask[]
}

export type DeliveryProjectVaultRevision = {
  id: string
  project_id: string
  repository_reference: string
  version: number
  revision: string
  schema_version: number
  content_sha256: string
  source_onboarding_id: string
  published_by: string
  published_at: string
  created_at: string
  manifest: DeliveryVaultManifest
}

export type DeliveryPolicySafetyFloor = {
  independent_review: boolean
  exact_sha_evidence: boolean
  vault_reconciliation: boolean
  secret_scan: boolean
  maximum_high_findings: number
  maximum_critical_findings: number
  compatibility: boolean
  migrations: boolean
  dependency_order: boolean
  environment: boolean
  recovery: boolean
  human_approval: boolean
  force_merge_allowed: boolean
}

export type DeliveryPolicyPatch = {
  mode?: 'review_only' | 'merge' | 'release'
  required_test_kinds?: string[]
  allowed_target_branches?: string[]
  merge_method?: 'merge' | 'squash' | 'rebase'
  deployment_workflow?: string
  deployment_environment?: string
  required_secret_references?: string[]
  required_variable_references?: string[]
  required_health_checks?: string[]
  required_post_merge_checks?: string[]
  recovery_default?: 'rollback' | 'roll_forward' | 'expand_contract' | 'irreversible'
}

export type DeliveryPolicyRevision = {
  id: string
  schema_version: 1
  level: 'project' | 'repository' | 'override'
  project_id: string
  repository?: string
  change_set_id?: string
  patch: DeliveryPolicyPatch
  reason?: string
  expires_at?: string
  content_sha256: string
  created_at: string
  status: 'pending' | 'approved' | 'revoked'
  latest_decision?: {
    id: string
    action: 'approved' | 'revoked'
    reason?: string
    occurred_at: string
  }
}

export type DeliveryEffectivePolicySnapshot = {
  schema_version: 1
  project_id: string
  repository: string
  change_set_id?: string
  overrides_considered: boolean
  evaluated_at: string
  vault: {
    revision_id: string
    version: number
    repository_sha: string
    content_sha256: string
  }
  policy: {
    schema_version: 1
    mode?: 'review_only' | 'merge' | 'release'
    required_test_kinds: string[]
    allowed_target_branches: string[]
    merge_method?: 'merge' | 'squash' | 'rebase'
    deployment_workflow?: string
    deployment_environment?: string
    required_secret_references: string[]
    required_variable_references: string[]
    required_health_checks: string[]
    required_post_merge_checks: string[]
    recovery_default?: 'rollback' | 'roll_forward' | 'expand_contract' | 'irreversible'
    safety: DeliveryPolicySafetyFloor
    sources: Array<{
      level: 'platform' | 'organization' | 'project' | 'repository' | 'override'
      revision_id: string
      digest: string
      approved_at: string
    }>
    resolved: boolean
    missing: string[]
    digest: string
  }
}

export type DeliveryGate = {
  id: string
  kind: 'plan' | 'code_review' | 'qa_review' | 'release'
  decision: 'approved' | 'changes_requested'
  decided_by: string
  comment?: string
  decided_at: string
}

export type DeliveryEvidence = {
  id: string
  kind: 'screenshot' | 'video' | 'test_result' | 'diff' | 'report' | 'log' | 'artifact'
  phase: string
  title: string
  reference: string
  metadata?: Record<string, unknown>
  captured_by?: string
  captured_at?: string
}

export type DeliveryMessage = {
  id: string
  phase: string
  author_type: 'human' | 'agent'
  author_id?: string
  body: string
  created_at: string
}

export type DeliveryRequest = {
  id: string
  project_id: string
  requested_by: string
  title: string
  body: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  constraints?: string
  expected_outcome: string
  status: string
  created_at: string
}

export type DeliveryPlan = {
  id: string
  work_item_id: string
  version: number
  status: 'proposed' | 'approved' | 'changes_requested'
  summary: string
  structured_result?: string
  context_digest?: string
  proposed_by?: string
  created_at: string
}

export type DeliveryChangeSet = {
  id: string
  work_item_id: string
  repository_ref: string
  branch?: string
  commit_sha?: string
  review_type?: 'pull_request' | 'local_worktree'
  pull_request_url?: string
  ci_status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'
  ci_url?: string
  preview_url?: string
  environment?: string
  metadata?: Record<string, unknown> | string
  created_at: string
}

// A publication grant is deliberately an authorization record, never a
// credential. The server mints a short-lived provider token only when this
// scope, the reviewed revision and the integration all match.
export type DeliveryPublicationGrant = {
  id: string
  work_item_id: string
  repository_ref: string
  base_sha: string
  github_repository?: string
  review_diff_sha256?: string
  branch: string
  capabilities?: string
  reason: string
  granted_by: string
  granted_at: string
  expires_at: string
  revoked_by?: string
  revoked_at?: string
  revocation_reason?: string
}

export type DeliveryPublicationReadiness = {
  state: 'ready' | 'not_configured' | 'invalid'
  provider: 'github_app'
  message: string
  requirements?: string[]
}

export type DeliveryPublicationVerification = {
  state: 'verified'
  provider: 'github_app'
  checked_at: string
}

export type DeliveryWorkItemDependency = {
  id: string
  work_item_id: string
  depends_on_work_item_id: string
  depends_on?: Pick<DeliveryWorkItem, 'id' | 'title' | 'state' | 'expected_outcome'>
  created_at: string
}

export type DeliveryRelease = {
  id: string
  work_item_id: string
  status: 'draft' | 'ready' | 'released'
  executive_summary?: string
  technical_summary?: string
  report_ref?: string
  released_by?: string
  released_at?: string
}

export type DeliveryProjectMember = {
  id: string
  project_id: string
  cognito_sub: string
  role: string
  permissions?: string
}

export type DeliveryWorkItem = {
  id: string
  project_id: string
  title: string
  description: string
  expected_outcome: string
  included_scope?: string
  excluded_scope?: string
  acceptance_criteria?: string
  client_context?: string
  state: string
  assigned_agent?: string
  pull_request_url?: string
  preview_url?: string
  budget_microusd?: number
  budget_alert_percent?: number
  created_at: string
  updated_at: string
  cost_summary?: {
    executions: number
    input_tokens: number
    output_tokens: number
    cached_input_tokens: number
    cache_write_tokens: number
    reasoning_tokens: number
    total_tokens: number
    input_cost_microusd: number
    output_cost_microusd: number
    cached_cost_microusd: number
    cache_write_cost_microusd: number
    total_cost_microusd: number
    steps: Array<{
      step_key: string
      execution_kind: 'agent' | 'tool'
      tool?: string
      call_key?: string
      executions: number
      input_tokens: number
      output_tokens: number
      cached_input_tokens: number
      cache_write_tokens: number
      reasoning_tokens: number
      total_tokens: number
      input_cost_microusd: number
      output_cost_microusd: number
      cached_cost_microusd: number
      cache_write_cost_microusd: number
      total_cost_microusd: number
    }>
  }
  context_snapshots?: Array<{
    id: string
    kind: string
    name: string
    reference: string
    revision: string
    metadata?: Record<string, unknown>
    captured_at: string
  }>
  gates?: DeliveryGate[]
  evidence?: DeliveryEvidence[]
  messages?: DeliveryMessage[]
  automation_tasks?: DeliveryAutomationTask[]
  plans?: DeliveryPlan[]
  change_sets?: DeliveryChangeSet[]
  publication_grants?: DeliveryPublicationGrant[]
  dependencies?: DeliveryWorkItemDependency[]
  request?: DeliveryRequest
  project?: DeliveryProject
}

export type DeliveryWorkItemBudget = {
  budget_microusd: number
  alert_percent: number
  spent_microusd: number
  reserved_microusd: number
  allocated_microusd: number
  remaining_microusd?: number
  enforced: boolean
}

export type DeliveryProject = {
  id: string
  client_id: string
  name: string
  slug: string
  summary: string
  status: string
  monthly_budget_microusd?: number
  budget_alert_percent?: number
  created_at: string
  updated_at: string
  client?: { id: string; name: string; code?: string }
  context?: DeliveryContextSource[]
  members?: DeliveryProjectMember[]
  requests?: DeliveryRequest[]
  releases?: DeliveryRelease[]
  work_items?: DeliveryWorkItem[]
}

export type DeliveryProjectBudget = {
  monthly_budget_microusd: number
  alert_percent: number
  spent_microusd: number
  reserved_microusd: number
  allocated_microusd: number
  remaining_microusd?: number
  enforced: boolean
  month_start: string
}

export type DeliveryClientProfile = {
  id: string
  client_id: string
  health: 'healthy' | 'watch' | 'at_risk'
  contacts?: string
  rules?: string
  conversation_summary?: string
  last_conversation_at?: string
  updated_at: string
}

export type DeliveryClientOverview = {
  client: { id: string; name: string; code?: string; logo?: string }
  profile?: DeliveryClientProfile
  project_count: number
  conversation_count: number
}
