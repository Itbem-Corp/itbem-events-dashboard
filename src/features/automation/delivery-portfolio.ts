import type { DeliveryTaskStatus } from './delivery-types'

export type DeliveryPortfolioTask = {
  id: string
  operation: string
  status: DeliveryTaskStatus
  attemptCount: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type DeliveryPortfolioGateSummary = {
  total: number
  approved: number
  changesRequested: number
}

export type DeliveryPortfolioWorkItem = {
  id: string
  projectId: string
  title: string
  state: string
  createdAt: string
  updatedAt: string
  automationTaskCount: number
  automationTasksTruncated: boolean
  automationTasks: DeliveryPortfolioTask[]
  gateSummary: DeliveryPortfolioGateSummary
  evidenceCount: number
}

export type DeliveryPortfolioProject = {
  id: string
  clientId: string
  name: string
  status: string
  updatedAt: string
  client: { id: string; name: string }
  workItemCount: number
  activeWorkItems: number
  decisionsRequired: number
  blockedWorkItems: number
  automationTasks: number
  queuedTasks: number
  runningTasks: number
  attentionTasks: number
  workItemsTruncated: boolean
  workItems: DeliveryPortfolioWorkItem[]
}

export type DeliveryPortfolioTotals = {
  projects: number
  workItems: number
  activeWorkItems: number
  decisionsRequired: number
  blockedWorkItems: number
  automationTasks: number
  queuedTasks: number
  runningTasks: number
  attentionTasks: number
  reviewTasks: number
  queuedReviews: number
  runningReviews: number
  attentionReviews: number
  publishedReviews: number
}

export type DeliveryPortfolioReview = {
  taskId: string
  repository: string
  pullRequest: number
  headSha: string
  status: DeliveryTaskStatus
  attemptCount: number
  verdict?: 'approve' | 'comment' | 'request_changes' | 'blocked'
  event?: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES'
  reviewUrl?: string
  reviewerActor?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  publishedAt?: string
}

export type DeliveryPortfolioSnapshot = {
  schemaVersion: number
  generatedAt: string
  revision: string
  totals: DeliveryPortfolioTotals
  projects: DeliveryPortfolioProject[]
  reviewQueue: DeliveryPortfolioReview[]
}

// The portfolio is the broad, low-cost read model used outside an individual
// work item. Tighten its cadence only while work is actually moving; otherwise
// a slower heartbeat keeps the product current without turning every open tab
// into a polling loop.
export function deliveryPortfolioRefreshInterval(snapshot: DeliveryPortfolioSnapshot | null | undefined) {
  if (!snapshot) return 15_000
  if (snapshot.totals.runningTasks > 0 || snapshot.totals.runningReviews > 0) return 6_000
  if (snapshot.totals.queuedTasks > 0 || snapshot.totals.queuedReviews > 0 || snapshot.totals.activeWorkItems > 0)
    return 12_000
  return 30_000
}

type RecordLike = Record<string, unknown>

const taskStatuses = new Set<DeliveryTaskStatus>([
  'queued',
  'running',
  'cancel_requested',
  'cancelled',
  'completed',
  'failed',
  'dispatch_failed',
])

function asRecord(value: unknown): RecordLike | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordLike) : null
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function bool(value: unknown): boolean {
  return value === true
}

function snakeOrCamel(record: RecordLike, snake: string, camel: string): unknown {
  return record[snake] ?? record[camel]
}

function portfolioTask(value: unknown): DeliveryPortfolioTask | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const operation = text(record.operation)
  const rawStatus = text(record.status)
  const createdAt = text(snakeOrCamel(record, 'created_at', 'createdAt'))
  const updatedAt = text(snakeOrCamel(record, 'updated_at', 'updatedAt'))
  if (!id || !operation || !taskStatuses.has(rawStatus as DeliveryTaskStatus) || !createdAt || !updatedAt) return null
  const completedAt = text(snakeOrCamel(record, 'completed_at', 'completedAt'))
  return {
    id,
    operation,
    status: rawStatus as DeliveryTaskStatus,
    attemptCount: count(snakeOrCamel(record, 'attempt_count', 'attemptCount')),
    createdAt,
    updatedAt,
    ...(completedAt ? { completedAt } : {}),
  }
}

function gateSummary(value: unknown): DeliveryPortfolioGateSummary {
  const record = asRecord(value)
  return {
    total: count(record?.total),
    approved: count(record?.approved),
    changesRequested: count(snakeOrCamel(record ?? {}, 'changes_requested', 'changesRequested')),
  }
}

function portfolioWorkItem(value: unknown): DeliveryPortfolioWorkItem | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const projectId = text(snakeOrCamel(record, 'project_id', 'projectId'))
  const title = text(record.title)
  const state = text(record.state)
  const createdAt = text(snakeOrCamel(record, 'created_at', 'createdAt'))
  const updatedAt = text(snakeOrCamel(record, 'updated_at', 'updatedAt'))
  if (!id || !projectId || !title || !state || !createdAt || !updatedAt) return null
  const tasks = Array.isArray(snakeOrCamel(record, 'automation_tasks', 'automationTasks'))
    ? (snakeOrCamel(record, 'automation_tasks', 'automationTasks') as unknown[])
        .map(portfolioTask)
        .filter((task): task is DeliveryPortfolioTask => task !== null)
    : []
  return {
    id,
    projectId,
    title,
    state,
    createdAt,
    updatedAt,
    automationTaskCount: count(snakeOrCamel(record, 'automation_task_count', 'automationTaskCount')),
    automationTasksTruncated: bool(snakeOrCamel(record, 'automation_tasks_truncated', 'automationTasksTruncated')),
    automationTasks: tasks,
    gateSummary: gateSummary(snakeOrCamel(record, 'gate_summary', 'gateSummary')),
    evidenceCount: count(snakeOrCamel(record, 'evidence_count', 'evidenceCount')),
  }
}

function portfolioProject(value: unknown): DeliveryPortfolioProject | null {
  const record = asRecord(value)
  if (!record) return null
  const id = text(record.id)
  const clientId = text(snakeOrCamel(record, 'client_id', 'clientId'))
  const name = text(record.name)
  const status = text(record.status)
  const updatedAt = text(snakeOrCamel(record, 'updated_at', 'updatedAt'))
  const client = asRecord(record.client)
  const clientName = text(client?.name)
  const clientID = text(client?.id, clientId)
  if (!id || !clientId || !name || !status || !updatedAt || !clientName) return null
  const workItemsValue = snakeOrCamel(record, 'work_items', 'workItems')
  const workItems = Array.isArray(workItemsValue)
    ? workItemsValue.map(portfolioWorkItem).filter((item): item is DeliveryPortfolioWorkItem => item !== null)
    : []
  return {
    id,
    clientId,
    name,
    status,
    updatedAt,
    client: { id: clientID, name: clientName },
    workItemCount: count(snakeOrCamel(record, 'work_item_count', 'workItemCount')),
    activeWorkItems: count(snakeOrCamel(record, 'active_work_items', 'activeWorkItems')),
    decisionsRequired: count(snakeOrCamel(record, 'decisions_required', 'decisionsRequired')),
    blockedWorkItems: count(snakeOrCamel(record, 'blocked_work_items', 'blockedWorkItems')),
    automationTasks: count(snakeOrCamel(record, 'automation_tasks', 'automationTasks')),
    queuedTasks: count(snakeOrCamel(record, 'queued_tasks', 'queuedTasks')),
    runningTasks: count(snakeOrCamel(record, 'running_tasks', 'runningTasks')),
    attentionTasks: count(snakeOrCamel(record, 'attention_tasks', 'attentionTasks')),
    workItemsTruncated: bool(snakeOrCamel(record, 'work_items_truncated', 'workItemsTruncated')),
    workItems,
  }
}

function portfolioTotals(value: unknown): DeliveryPortfolioTotals {
  const record = asRecord(value) ?? {}
  return {
    projects: count(record.projects),
    workItems: count(snakeOrCamel(record, 'work_items', 'workItems')),
    activeWorkItems: count(snakeOrCamel(record, 'active_work_items', 'activeWorkItems')),
    decisionsRequired: count(snakeOrCamel(record, 'decisions_required', 'decisionsRequired')),
    blockedWorkItems: count(snakeOrCamel(record, 'blocked_work_items', 'blockedWorkItems')),
    automationTasks: count(snakeOrCamel(record, 'automation_tasks', 'automationTasks')),
    queuedTasks: count(snakeOrCamel(record, 'queued_tasks', 'queuedTasks')),
    runningTasks: count(snakeOrCamel(record, 'running_tasks', 'runningTasks')),
    attentionTasks: count(snakeOrCamel(record, 'attention_tasks', 'attentionTasks')),
    reviewTasks: count(snakeOrCamel(record, 'review_tasks', 'reviewTasks')),
    queuedReviews: count(snakeOrCamel(record, 'queued_reviews', 'queuedReviews')),
    runningReviews: count(snakeOrCamel(record, 'running_reviews', 'runningReviews')),
    attentionReviews: count(snakeOrCamel(record, 'attention_reviews', 'attentionReviews')),
    publishedReviews: count(snakeOrCamel(record, 'published_reviews', 'publishedReviews')),
  }
}

function portfolioReview(value: unknown): DeliveryPortfolioReview | null {
  const record = asRecord(value)
  if (!record) return null
  const taskId = text(snakeOrCamel(record, 'task_id', 'taskId'))
  const repository = text(record.repository).toLowerCase()
  const pullRequest = count(snakeOrCamel(record, 'pull_request', 'pullRequest'))
  const headSha = text(snakeOrCamel(record, 'head_sha', 'headSha')).toLowerCase()
  const rawStatus = text(record.status)
  const createdAt = text(snakeOrCamel(record, 'created_at', 'createdAt'))
  const updatedAt = text(snakeOrCamel(record, 'updated_at', 'updatedAt'))
  if (
    !taskId ||
    !/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(repository) ||
    !Number.isInteger(pullRequest) ||
    pullRequest < 1 ||
    !/^[a-f0-9]{40}$/.test(headSha) ||
    !taskStatuses.has(rawStatus as DeliveryTaskStatus) ||
    !createdAt ||
    !updatedAt
  )
    return null

  const completedAt = text(snakeOrCamel(record, 'completed_at', 'completedAt'))
  const verdict = text(record.verdict).toLowerCase()
  const event = text(record.event).toUpperCase()
  const reviewUrl = text(snakeOrCamel(record, 'review_url', 'reviewUrl'))
  const reviewerActor = text(snakeOrCamel(record, 'reviewer_actor', 'reviewerActor')).toLowerCase()
  const publishedAt = text(snakeOrCamel(record, 'published_at', 'publishedAt'))
  const hasPublication = Boolean(verdict || event || reviewUrl || reviewerActor || publishedAt)
  if (hasPublication) {
    const validVerdictEvent =
      (verdict === 'approve' && (event === 'APPROVE' || event === 'COMMENT')) ||
      (verdict === 'request_changes' && event === 'REQUEST_CHANGES') ||
      ((verdict === 'comment' || verdict === 'blocked') && event === 'COMMENT')
    let parsedURL: URL
    try {
      parsedURL = new URL(reviewUrl)
    } catch {
      return null
    }
    const parts = parsedURL.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (
      !validVerdictEvent ||
      !reviewerActor ||
      !publishedAt ||
      parsedURL.protocol !== 'https:' ||
      parsedURL.hostname.toLowerCase() !== 'github.com' ||
      parsedURL.username ||
      parsedURL.password ||
      parsedURL.search ||
      parts.length !== 4 ||
      `${parts[0]}/${parts[1]}`.toLowerCase() !== repository ||
      parts[2] !== 'pull' ||
      parts[3] !== String(pullRequest) ||
      !/^#pullrequestreview-[1-9][0-9]*$/.test(parsedURL.hash)
    )
      return null
  }
  return {
    taskId,
    repository,
    pullRequest,
    headSha,
    status: rawStatus as DeliveryTaskStatus,
    attemptCount: count(snakeOrCamel(record, 'attempt_count', 'attemptCount')),
    ...(completedAt ? { completedAt } : {}),
    createdAt,
    updatedAt,
    ...(hasPublication
      ? {
          verdict: verdict as DeliveryPortfolioReview['verdict'],
          event: event as DeliveryPortfolioReview['event'],
          reviewUrl,
          reviewerActor,
          publishedAt,
        }
      : {}),
  }
}

/**
 * Normalizes the compact Go read model at the boundary. The console can safely
 * fall back to the older project list while a rolling deployment is in flight.
 */
export function normalizeDeliveryPortfolio(value: unknown): DeliveryPortfolioSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  const schemaVersion = count(snakeOrCamel(record, 'schema_version', 'schemaVersion'))
  const generatedAt = text(snakeOrCamel(record, 'generated_at', 'generatedAt'))
  const revision = text(record.revision)
  const projectsValue = record.projects
  // Schema v2 did not expose standalone webhook reviews. Accept an absent
  // queue as empty while backend and dashboard roll independently; malformed
  // queue values still invalidate the snapshot instead of being trusted.
  const reviewQueueValue = snakeOrCamel(record, 'review_queue', 'reviewQueue') ?? []
  if (!schemaVersion || !generatedAt || !revision || !Array.isArray(projectsValue) || !Array.isArray(reviewQueueValue))
    return null
  return {
    schemaVersion,
    generatedAt,
    revision,
    totals: portfolioTotals(record.totals),
    projects: projectsValue
      .map(portfolioProject)
      .filter((project): project is DeliveryPortfolioProject => project !== null),
    reviewQueue: reviewQueueValue
      .map(portfolioReview)
      .filter((review): review is DeliveryPortfolioReview => review !== null),
  }
}
