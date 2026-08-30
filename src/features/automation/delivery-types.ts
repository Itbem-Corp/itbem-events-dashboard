export type DeliveryTaskStatus = 'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'completed' | 'failed' | 'dispatch_failed'

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
