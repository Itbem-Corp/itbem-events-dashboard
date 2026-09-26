'use client'

import { Badge } from '@/components/badge'
import { Dialog, DialogBody, DialogTitle } from '@/components/dialog'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { deliveryCostRefreshInterval } from '@/features/automation/delivery-cost-refresh'
import { deliveryProjectEpicsPagePath, type DeliveryEpicListPage, type DeliveryEpicSummary } from '@/features/automation/delivery-epics'
import { localSessionRecoveryMessage } from '@/lib/api'
import { automationCostsPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ChartBarSquareIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'

const DeliveryResultPanel = dynamic(
  () => import('@/features/automation/delivery-result-panel').then((module) => module.DeliveryResultPanel),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" aria-label="Preparando detalle de ejecución" className="h-56 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
    ),
  },
)

function preloadExecutionDetail() {
  void import('@/features/automation/delivery-result-panel')
}

function localDateBoundary(value: string, nextDay = false): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const numericYear = Number(year)
  const boundary = new Date(numericYear, Number(month) - 1, Number(day) + (nextDay ? 1 : 0))
  if (numericYear >= 0 && numericYear < 100) boundary.setFullYear(numericYear)
  return Number.isNaN(boundary.getTime()) ? null : boundary.toISOString()
}

function sameCostTimestamp(actual: string | null | undefined, expected: string | null): boolean {
  if (!expected) return !actual
  return Boolean(actual && Date.parse(actual) === Date.parse(expected))
}

type GuardrailStatus = 'healthy' | 'attention' | 'exceeded'

type TokenCostDimensions = {
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
}

type CostBreakdown = TokenCostDimensions & {
  key: string
  execution_kind?: 'agent' | 'tool'
  tool?: string
  call_key?: string
  executions: number
}

type ProjectCostBreakdown = TokenCostDimensions & {
  project_id?: string
  project_name: string
  executions: number
}

type ModelCostBreakdown = TokenCostDimensions & {
  provider: string
  model: string
  executions: number
}

type AgentCostBreakdown = {
  agent_key: string
  executions: number
  total_tokens: number
  total_cost_microusd: number
}

type AgentInstanceCostBreakdown = {
  agent_key: string
  agent_instance_id: string | null
  instance_attributed: boolean
  executions: number
  total_tokens: number
  total_cost_microusd: number
}

type AgentInstanceCostPage = {
  range_days: number
  snapshot_at: string
  applied_filters?: {
    client_id?: string | null
    project_id?: string | null
    epic_id?: string | null
    work_item_id?: string | null
    agent_key?: string | null
    agent_instance_id?: string | null
    step_key?: string | null
    provider?: string | null
    model?: string | null
    from_at?: string | null
    to_at?: string | null
  }
  items: AgentInstanceCostBreakdown[]
  limit: number
  has_more: boolean
  next_cursor?: string
}

type WorkItemCostBreakdown = {
  project_id?: string
  project_name: string
  work_item_id: string
  work_item_title: string
  executions: number
  total_tokens: number
  total_cost_microusd: number
}

type ProjectBudgetWatch = {
  project_id: string
  project_name: string
  monthly_budget_microusd: number
  alert_percent: number
  spent_microusd: number
  reserved_microusd: number
  allocated_microusd: number
  remaining_microusd: number
  usage_percent: number
  status: GuardrailStatus
}

type TaskBudgetWatch = {
  project_id: string
  project_name: string
  work_item_id: string
  work_item_title: string
  budget_microusd: number
  alert_percent: number
  spent_microusd: number
  reserved_microusd: number
  allocated_microusd: number
  remaining_microusd: number
  usage_percent: number
  status: GuardrailStatus
}

type RecentExecution = TokenCostDimensions & {
  id: string
  automation_task_id: string
  delivery_work_item_id?: string
  project_id?: string
  project_name?: string
  work_item_title?: string
  agent_key?: string
  agent_instance_id?: string
  operation: string
  task_status: 'completed' | 'failed'
  execution_kind: 'agent' | 'tool'
  tool?: string
  call_key?: string
  call_status?: 'completed' | 'failed'
  step_key: string
  provider: string
  model: string
  pricing_basis: string
  completed_at: string
}

type CostOverview = {
  range_days: number
  snapshot_at?: string
  applied_filters?: {
    client_id?: string | null
    project_id?: string | null
    epic_id?: string | null
    work_item_id?: string | null
    step_key?: string | null
    agent_key?: string | null
    agent_instance_id?: string | null
    provider?: string | null
    model?: string | null
    from_at?: string | null
    to_at?: string | null
  }
  summary: TokenCostDimensions & {
    executions: number
    tasks: number
    /** Total executions in the filtered snapshot without a usable price basis. */
    unpriced_executions?: number
  }
  by_operation: CostBreakdown[] | null
  by_step: CostBreakdown[] | null
  by_project: ProjectCostBreakdown[] | null
  by_work_item?: WorkItemCostBreakdown[] | null
  by_work_item_limit?: number
  by_work_item_cursor?: string | null
  by_work_item_next_cursor?: string | null
  by_agent?: AgentCostBreakdown[] | null
  by_model: ModelCostBreakdown[] | null
  budget_watch: ProjectBudgetWatch[] | null
  task_budget_watch: TaskBudgetWatch[] | null
  recent_execution_page?: {
    page: number
    page_size: number
    total: number
    total_pages: number
    mode?: 'offset' | 'cursor'
    has_more?: boolean
    next_cursor?: string
  }
  recent_executions: RecentExecution[] | null
  ledger_coverage?: {
    state?: 'complete' | 'partial' | 'unavailable'
    agent_ledger?: boolean
    tool_ledger?: boolean
    unknown_dimensions?: string[]
  }
}

type WorkItemCostPagination = {
  scopeKey: string
  cursor: string | null
  rows: WorkItemCostBreakdown[]
  nextCursor: string | null
}

type AgentInstanceCostPagination = {
  scopeKey: string
  snapshotAt: string
  cursor: string | null
  rows: AgentInstanceCostBreakdown[]
  nextCursor: string | null
}

type GuardrailItem = {
  id: string
  title: string
  context: string
  href: string
  status: GuardrailStatus
  usagePercent: number
  spentMicrousd: number
  reservedMicrousd: number
  remainingMicrousd: number
  budgetMicrousd: number
  alertPercent: number
  kind: 'project' | 'task'
}

function money(micros = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000)
}

const ledgerDimensionLabels: Record<string, string> = {
  tool_ledger: 'registro de costos de herramientas',
  input_cost_micros: 'costo de entrada',
  output_cost_micros: 'costo de salida',
  cached_cost_micros: 'costo de caché leída',
  cache_write_cost_micros: 'costo de caché escrita',
  input_tokens: 'tokens de entrada',
  output_tokens: 'tokens de salida',
  cached_input_tokens: 'tokens de caché leída',
  cache_write_tokens: 'tokens de caché escrita',
  reasoning_tokens: 'tokens de razonamiento',
  total_tokens: 'tokens totales',
  agent_instance_id: 'atribución a instancia',
  agent_key: 'atribución a agente',
  provider: 'atribución a proveedor',
  model: 'atribución a modelo',
  delivery_work_item_id: 'atribución a tarea',
  step_key: 'atribución a paso',
}

function ledgerDimensionLabel(dimension: string) {
  return ledgerDimensionLabels[dimension] ?? 'datos de uso adicionales'
}

function ledgerDimensionMoney(micros: number, dimension: string, unknownDimensions: ReadonlySet<string>) {
  return unknownDimensions.has(dimension) ? 'No disponible' : money(micros)
}

function hasKnownExecutionPrice(execution: Pick<RecentExecution, 'pricing_basis'>) {
  const pricingBasis = execution.pricing_basis.trim().toLowerCase()
  return pricingBasis !== '' && pricingBasis !== 'unpriced'
}

function executionCostMoney(execution: RecentExecution) {
  return hasKnownExecutionPrice(execution) ? money(execution.total_cost_microusd) : 'No disponible'
}

function number(value = 0) {
  return new Intl.NumberFormat('es-MX').format(value)
}

function clampPercent(value = 0) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function costShare(cost = 0, total = 0) {
  return total > 0 ? clampPercent((cost / total) * 100) : 0
}

function executionLabel(value: string) {
  const normalized = value.replace(/^delivery\./, '')
  const labels: Record<string, string> = {
    chat: 'Conversación',
    plan: 'Plan',
    implementation: 'Construir',
    publish: 'Publicar',
    qa: 'QA',
    summary: 'Cierre',
    execution: 'Ejecución',
  }
  return labels[normalized] ?? value
}

function budgetStatus(status: GuardrailStatus) {
  if (status === 'exceeded') {
    return {
      label: 'Límite alcanzado',
      color: 'rose' as const,
      meter: 'bg-rose-500',
      dot: 'bg-rose-500',
    }
  }
  if (status === 'attention') {
    return {
      label: 'Revisar pronto',
      color: 'amber' as const,
      meter: 'bg-amber-400',
      dot: 'bg-amber-400',
    }
  }
  return {
    label: 'En rango',
    color: 'emerald' as const,
    meter: 'bg-emerald-400',
    dot: 'bg-emerald-400',
  }
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Hace un momento'
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function shortUsage(row: Pick<TokenCostDimensions, 'total_tokens'> & { executions?: number }) {
  return `${number(row.executions ?? 1)} ejec. · ${number(row.total_tokens)} tokens`
}

function normalizeAgentInstanceID(value: string) {
  const normalized = value.trim().toLowerCase()
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
  return isUUID && normalized !== '00000000-0000-0000-0000-000000000000' ? normalized : ''
}

function normalizeEpicID(value: string) {
  const normalized = value.trim().toLowerCase()
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
  return isUUID && normalized !== '00000000-0000-0000-0000-000000000000' ? normalized : ''
}

function normalizeStepKey(value: string) {
  const normalized = value.trim()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : ''
}

function shortAgentInstanceID(value: string) {
  return value.slice(0, 8)
}

function addAgentInstanceFilter(path: string, instanceID: string) {
  const [pathname, query = ''] = path.split('?', 2)
  const params = new URLSearchParams(query)
  params.set('agent_instance_id', instanceID)
  return `${pathname}?${params.toString()}`
}

function automationAgentInstanceCostsPath(filters: {
  days: number
  fromAt: string | null
  toAt: string | null
  clientId: string
  projectId: string
  epicId: string
  workItemId: string
  agentKey: string
  agentInstanceId: string
  stepKey: string
  provider: string
  model: string
  cursor: string | null
}) {
  const params = new URLSearchParams({ days: String(filters.days), agent_instance_limit: '25' })
  if (filters.fromAt) params.set('from_at', filters.fromAt)
  if (filters.toAt) params.set('to_at', filters.toAt)
  const values: Array<[string, string]> = [
    ['client_id', filters.clientId],
    ['project_id', filters.projectId],
    ['epic_id', filters.epicId],
    ['work_item_id', filters.workItemId],
    ['agent_key', filters.agentKey],
    ['agent_instance_id', filters.agentInstanceId],
    ['step_key', filters.stepKey],
    ['provider', filters.provider],
    ['model', filters.model],
  ]
  for (const [name, value] of values) {
    if (value) params.set(name, value)
  }
  if (filters.cursor) params.set('agent_instance_cursor', filters.cursor)
  return `/automation/costs/agent-instances?${params.toString()}`
}

export default function AutomationCostsPage() {
  const [days, setDays] = useState(30)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [costSnapshotAt, setCostSnapshotAt] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [clientFilter, setClientFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [epicFilterInput, setEpicFilterInput] = useState('')
  const [taskFilter, setTaskFilter] = useState('')
  const [stepFilterInput, setStepFilterInput] = useState('')
  const [epicOptionsCursor, setEpicOptionsCursor] = useState<string | undefined>()
  const [epicOptionsState, setEpicOptionsState] = useState<{ projectId: string; items: DeliveryEpicSummary[] }>({ projectId: '', items: [] })
  const [agentFilter, setAgentFilter] = useState('')
  const [agentInstanceInput, setAgentInstanceInput] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [workItemCosts, setWorkItemCosts] = useState<WorkItemCostPagination>({
    scopeKey: '',
    cursor: null,
    rows: [],
    nextCursor: null,
  })
  const [agentInstanceCosts, setAgentInstanceCosts] = useState<AgentInstanceCostPagination>({
    scopeKey: '',
    snapshotAt: '',
    cursor: null,
    rows: [],
    nextCursor: null,
  })
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [expandedCostExecutionId, setExpandedCostExecutionId] = useState<string | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<{
    id: string
    taskId: string
    kind: 'agent' | 'tool'
  } | null>(null)
  const resetLedgerPage = () => {
    setPage(1)
    setCursor(null)
    setCursorHistory([])
    setCostSnapshotAt(null)
    setSelectedExecution(null)
  }
  const resetCostPages = () => {
    resetLedgerPage()
    setWorkItemCosts({ scopeKey: '', cursor: null, rows: [], nextCursor: null })
  }
  const customDateRangeActive = Boolean(fromDate && toDate)
  const fromAt = customDateRangeActive ? localDateBoundary(fromDate) : null
  const toAt = customDateRangeActive ? localDateBoundary(toDate, true) : null
  const customDateRangeIncomplete = Boolean(fromDate) !== Boolean(toDate)
  const today = new Date()
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const epicFilter = normalizeEpicID(epicFilterInput)
  const stepFilter = normalizeStepKey(stepFilterInput)
  const workItemCostScopeKey = JSON.stringify([
    days,
    fromDate,
    toDate,
    clientFilter,
    projectFilter,
    epicFilter,
    taskFilter,
    stepFilter,
    agentFilter,
    normalizeAgentInstanceID(agentInstanceInput),
    providerFilter,
    modelFilter,
  ])
  const agentInstanceFilter = normalizeAgentInstanceID(agentInstanceInput)
  const workItemCursor = workItemCosts.scopeKey === workItemCostScopeKey ? workItemCosts.cursor : null
  const agentInstanceCostScopeKey = JSON.stringify([
    days,
    fromDate,
    toDate,
    clientFilter,
    projectFilter,
    epicFilter,
    taskFilter,
    stepFilter,
    agentFilter,
    agentInstanceFilter,
    providerFilter,
    modelFilter,
  ])
  const agentInstanceCostCursor = agentInstanceCosts.scopeKey === agentInstanceCostScopeKey ? agentInstanceCosts.cursor : null
  const costOverviewPath = automationCostsPath({
    days,
    from_at: fromAt,
    to_at: toAt,
    snapshot_at: page > 1 ? costSnapshotAt : null,
    client_id: clientFilter || null,
    project_id: projectFilter || null,
    epic_id: epicFilter || null,
    work_item_id: taskFilter || null,
    step_key: stepFilter || null,
    agent_key: agentFilter || null,
    provider: providerFilter || null,
    model: modelFilter || null,
    page,
    page_size: 40,
    cursor,
    work_item_limit: 20,
    work_item_cursor: workItemCursor,
  })
  const { data, error, isLoading, isValidating, mutate } = useSWR<CostOverview>(
    agentInstanceFilter ? addAgentInstanceFilter(costOverviewPath, agentInstanceFilter) : costOverviewPath,
    fetcher,
    {
      refreshInterval: deliveryCostRefreshInterval,
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  )
  const projectList = useSWR<DeliveryProject[]>(deliveryProjectsPath(), fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
  })
  const agentInstanceCostPath = analysisOpen
    ? automationAgentInstanceCostsPath({
        days,
        fromAt,
        toAt,
        clientId: clientFilter,
        projectId: projectFilter,
        epicId: epicFilter,
        workItemId: taskFilter,
        agentKey: agentFilter,
        agentInstanceId: agentInstanceFilter,
        stepKey: stepFilter,
        provider: providerFilter,
        model: modelFilter,
        cursor: agentInstanceCostCursor,
      })
    : null
  const {
    data: agentInstanceCostPage,
    error: agentInstanceCostError,
    isLoading: isAgentInstanceCostLoading,
    isValidating: isAgentInstanceCostValidating,
    mutate: refreshAgentInstanceCosts,
  } = useSWR<AgentInstanceCostPage>(agentInstanceCostPath, fetcher, {
    dedupingInterval: 5_000,
    revalidateOnFocus: true,
    refreshInterval: agentInstanceCostCursor ? 0 : 15_000,
    keepPreviousData: false,
  })
  const epicOptionsPath = projectFilter
    ? deliveryProjectEpicsPagePath(projectFilter, { limit: 100, cursor: epicOptionsCursor })
    : null
  const epicOptionsQuery = useSWR<DeliveryEpicListPage>(epicOptionsPath, fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
  })
  useEffect(() => {
    if (!projectFilter || !epicOptionsQuery.data) return
    const incoming = epicOptionsQuery.data.items.filter((epic) => epic.project_id === projectFilter)
    setEpicOptionsState((current) => {
      const existingItems = current.projectId === projectFilter ? current.items : []
      const byId = new Map(existingItems.map((epic) => [epic.id, epic]))
      for (const epic of incoming) byId.set(epic.id, epic)
      const items = [...byId.values()]
      if (current.projectId === projectFilter && current.items.length === items.length && current.items.every((epic, index) => epic.id === items[index]?.id)) return current
      return { projectId: projectFilter, items }
    })
  }, [epicOptionsQuery.data, projectFilter])
  const summary = data?.summary
  const ledgerCoverage = data?.ledger_coverage
  const unknownLedgerDimensions = new Set(ledgerCoverage?.unknown_dimensions ?? [])
  const hasPartialLedger = ledgerCoverage?.state === 'partial'
  const recentExecutions = data?.recent_executions ?? []
  const recentPage = data?.recent_execution_page ?? {
    page,
    page_size: 40,
    total: recentExecutions.length,
    total_pages: 1,
    mode: 'offset' as const,
    has_more: false,
  }
  const visibleUnpricedExecutionCount = recentExecutions.filter((execution) => !hasKnownExecutionPrice(execution)).length
  const reportedUnpricedExecutionCount = typeof summary?.unpriced_executions === 'number' &&
    Number.isSafeInteger(summary.unpriced_executions) &&
    summary.unpriced_executions >= 0
    ? summary.unpriced_executions
    : null
  // A visible unpriced row is direct evidence even if a stale/inconsistent API reports zero.
  const hasUnpricedExecutions = visibleUnpricedExecutionCount > 0 || (reportedUnpricedExecutionCount ?? 0) > 0
  const unpricedExecutionCountForCopy = Math.max(reportedUnpricedExecutionCount ?? 0, visibleUnpricedExecutionCount)
  const unpricedExecutionCountIsLowerBound = reportedUnpricedExecutionCount === null ||
    reportedUnpricedExecutionCount < visibleUnpricedExecutionCount
  const unpricedExecutionCountLabel = unpricedExecutionCountForCopy === 1
    ? '1 ejecución'
    : `${number(unpricedExecutionCountForCopy)} ejecuciones`
  const unpricedExecutionCountCopy = `${unpricedExecutionCountIsLowerBound ? 'Al menos ' : ''}${unpricedExecutionCountLabel}`
  // Older servers have no aggregate count. If their page is not exhaustive, pricing completeness is unknown.
  const hasUnconfirmedPricingCoverage = reportedUnpricedExecutionCount === null &&
    Math.max(recentPage.total, summary?.executions ?? 0) > recentExecutions.length
  const hasIncompleteTotalCost = hasPartialLedger && (
    !ledgerCoverage?.tool_ledger ||
    unknownLedgerDimensions.has('tool_ledger') ||
    unknownLedgerDimensions.has('total_cost_micros')
  ) || hasUnpricedExecutions || hasUnconfirmedPricingCoverage
  const unknownLedgerDimensionLabels = [...unknownLedgerDimensions].map(ledgerDimensionLabel)
  const byOperation = data?.by_operation ?? []
  const byStep = data?.by_step ?? []
  const byProject = data?.by_project ?? []
  const byModel = data?.by_model ?? []
  const byAgent = data?.by_agent ?? []
  const instanceOptions = new Map<string, string>()
  for (const execution of recentExecutions) {
    const instanceID = normalizeAgentInstanceID(execution.agent_instance_id ?? '')
    if (instanceID && !instanceOptions.has(instanceID)) instanceOptions.set(instanceID, execution.agent_key ?? '')
  }
  if (agentInstanceFilter && !instanceOptions.has(agentInstanceFilter)) instanceOptions.set(agentInstanceFilter, '')
  const availableAgentInstances = [...instanceOptions].map(([id, agentKey]) => ({ id, agentKey }))
  const scopedWorkItemCosts = workItemCosts.scopeKey === workItemCostScopeKey ? workItemCosts.rows : []
  const workItemNextCursor = workItemCosts.scopeKey === workItemCostScopeKey ? workItemCosts.nextCursor : null
  const scopedAgentInstanceCosts = agentInstanceCosts.scopeKey === agentInstanceCostScopeKey ? agentInstanceCosts.rows : []
  const agentInstanceNextCursor = agentInstanceCosts.scopeKey === agentInstanceCostScopeKey ? agentInstanceCosts.nextCursor : null
  const projectWorkItems = scopedWorkItemCosts.filter((item) => !projectFilter || item.project_id === projectFilter)
  const availableEpics = epicOptionsState.projectId === projectFilter ? epicOptionsState.items : []
  const availableClients = [...new Map((projectList.data ?? []).map((project) => [
    project.client_id,
    { id: project.client_id, name: project.client?.name?.trim() || project.client_id },
  ])).values()].sort((left, right) => left.name.localeCompare(right.name))
  const availableProjects = (projectList.data ?? []).filter((project) => !clientFilter || project.client_id === clientFilter)
  const selectedEpicMissing = epicFilter && !availableEpics.some((epic) => epic.id === epicFilter)
  const availableStepKeys = [...new Set([...byStep.map((row) => row.key).filter((key) => /^[a-z][a-z0-9_-]{0,63}$/.test(key)), ...(stepFilter ? [stepFilter] : [])])].sort()
  const availableProviders = [...new Set([...byModel.map((row) => row.provider).filter(Boolean), ...(providerFilter ? [providerFilter] : [])])].sort()
  const availableModels = byModel
    .filter((row) => !providerFilter || row.provider === providerFilter)
    .map((row) => row.model)
    .filter(Boolean)
    .concat(modelFilter && !byModel.some((row) => row.model === modelFilter) ? [modelFilter] : [])
    .sort()
  const availableAgents = [...new Set([...byAgent.map((row) => row.agent_key).filter(Boolean), ...(agentFilter ? [agentFilter] : [])])].sort()
  const selectedTaskMissing = taskFilter && !projectWorkItems.some((item) => item.work_item_id === taskFilter)
  useEffect(() => {
    if (!data || data.range_days !== days || !data.snapshot_at || !data.applied_filters) return
    const applied = data.applied_filters
    if (
      (applied.client_id ?? '') !== clientFilter ||
      (applied.project_id ?? '') !== projectFilter ||
      (applied.epic_id ?? '') !== epicFilter ||
      (applied.work_item_id ?? '') !== taskFilter ||
      (applied.step_key ?? '') !== stepFilter ||
      (applied.agent_key ?? '') !== agentFilter ||
      (applied.agent_instance_id ?? '') !== agentInstanceFilter ||
      (applied.provider ?? '') !== providerFilter ||
      (applied.model ?? '') !== modelFilter ||
      !sameCostTimestamp(applied.from_at, fromAt) ||
      !sameCostTimestamp(applied.to_at, toAt)
    ) return
    setCostSnapshotAt((current) => current === data.snapshot_at ? current : data.snapshot_at!)
  }, [
    data,
    days,
    clientFilter,
    projectFilter,
    epicFilter,
    taskFilter,
    stepFilter,
    agentFilter,
    agentInstanceFilter,
    providerFilter,
    modelFilter,
    fromAt,
    toAt,
  ])
  useEffect(() => {
    if (!data || data.range_days !== days || !data.applied_filters) return
    const applied = data.applied_filters
    if (
      (applied.client_id ?? '') !== clientFilter ||
      (applied.project_id ?? '') !== projectFilter ||
      (applied.epic_id ?? '') !== epicFilter ||
      (applied.work_item_id ?? '') !== taskFilter ||
      (applied.step_key ?? '') !== stepFilter ||
      (applied.agent_key ?? '') !== agentFilter ||
      (applied.agent_instance_id ?? '') !== agentInstanceFilter ||
      (applied.provider ?? '') !== providerFilter ||
      (applied.model ?? '') !== modelFilter ||
      !sameCostTimestamp(applied.from_at, fromAt) ||
      !sameCostTimestamp(applied.to_at, toAt) ||
      (data.by_work_item_cursor || null) !== workItemCursor
    ) return

    setWorkItemCosts((current) => {
      const existingRows = current.scopeKey === workItemCostScopeKey ? current.rows : []
      const rowsByID = new Map(existingRows.map((row) => [row.work_item_id, row]))
      for (const row of data.by_work_item ?? []) rowsByID.set(row.work_item_id, row)
      const rows = [...rowsByID.values()]
      const nextCursor = data.by_work_item_next_cursor || null
      const isUnchanged =
        current.scopeKey === workItemCostScopeKey &&
        current.cursor === workItemCursor &&
        current.nextCursor === nextCursor &&
        current.rows.length === rows.length &&
        current.rows.every((row, index) => {
          const nextRow = rows[index]
          return nextRow &&
            row.work_item_id === nextRow.work_item_id &&
            row.work_item_title === nextRow.work_item_title &&
            row.project_id === nextRow.project_id &&
            row.total_cost_microusd === nextRow.total_cost_microusd &&
            row.total_tokens === nextRow.total_tokens &&
            row.executions === nextRow.executions
        })
      if (isUnchanged) return current
      return {
        scopeKey: workItemCostScopeKey,
        cursor: workItemCursor,
        rows,
        nextCursor,
      }
    })
  }, [
    data,
    days,
    clientFilter,
    projectFilter,
    epicFilter,
    taskFilter,
    stepFilter,
    agentFilter,
    providerFilter,
    modelFilter,
    fromAt,
    toAt,
    agentInstanceFilter,
    workItemCursor,
    workItemCostScopeKey,
  ])
  useEffect(() => {
    if (!agentInstanceCostPage || agentInstanceCostPage.range_days !== days || !agentInstanceCostPage.applied_filters) return
    const applied = agentInstanceCostPage.applied_filters
    if (
      (applied.client_id ?? '') !== clientFilter ||
      (applied.project_id ?? '') !== projectFilter ||
      (applied.epic_id ?? '') !== epicFilter ||
      (applied.work_item_id ?? '') !== taskFilter ||
      (applied.agent_key ?? '') !== agentFilter ||
      (applied.agent_instance_id ?? '') !== agentInstanceFilter ||
      (applied.step_key ?? '') !== stepFilter ||
      (applied.provider ?? '') !== providerFilter ||
      (applied.model ?? '') !== modelFilter ||
      !sameCostTimestamp(applied.from_at, fromAt) ||
      !sameCostTimestamp(applied.to_at, toAt)
    ) return

    setAgentInstanceCosts((current) => {
      const sameSnapshot = current.snapshotAt === agentInstanceCostPage.snapshot_at
      const existingRows = current.scopeKey === agentInstanceCostScopeKey && sameSnapshot ? current.rows : []
      const rowsByIdentity = new Map(existingRows.map((row) => [
        `${row.agent_key}:${row.agent_instance_id ?? 'unattributed'}`,
        row,
      ]))
      for (const row of agentInstanceCostPage.items ?? []) {
        rowsByIdentity.set(`${row.agent_key}:${row.agent_instance_id ?? 'unattributed'}`, row)
      }
      const rows = [...rowsByIdentity.values()]
      const nextCursor = agentInstanceCostPage.next_cursor || null
      const unchanged =
        current.scopeKey === agentInstanceCostScopeKey &&
        current.snapshotAt === agentInstanceCostPage.snapshot_at &&
        current.cursor === agentInstanceCostCursor &&
        current.nextCursor === nextCursor &&
        current.rows.length === rows.length &&
        current.rows.every((row, index) => {
          const next = rows[index]
          return next &&
            row.agent_key === next.agent_key &&
            row.agent_instance_id === next.agent_instance_id &&
            row.executions === next.executions &&
            row.total_tokens === next.total_tokens &&
            row.total_cost_microusd === next.total_cost_microusd
        })
      if (unchanged) return current
      return {
        scopeKey: agentInstanceCostScopeKey,
        snapshotAt: agentInstanceCostPage.snapshot_at,
        cursor: agentInstanceCostCursor,
        rows,
        nextCursor,
      }
    })
  }, [
    agentInstanceCostPage,
    agentInstanceCostCursor,
    agentInstanceCostScopeKey,
    days,
    clientFilter,
    projectFilter,
    epicFilter,
    taskFilter,
    agentFilter,
    agentInstanceFilter,
    stepFilter,
    providerFilter,
    modelFilter,
    fromAt,
    toAt,
  ])
  const activeCostFilters = [
    clientFilter && {
      key: 'client',
      label: `Cliente: ${availableClients.find((client) => client.id === clientFilter)?.name ?? clientFilter}`,
    },
    projectFilter && {
      key: 'project',
      label: `Proyecto: ${projectList.data?.find((project) => project.id === projectFilter)?.name ?? projectFilter}`,
    },
    epicFilter && {
      key: 'epic',
      label: `Épica: ${availableEpics.find((epic) => epic.id === epicFilter)?.title ?? epicFilter}`,
    },
    taskFilter && {
      key: 'task',
      label: `Tarea: ${projectWorkItems.find((item) => item.work_item_id === taskFilter)?.work_item_title ?? taskFilter}`,
    },
    stepFilter && { key: 'step', label: `Paso: ${stepFilter}` },
    agentInstanceFilter && { key: 'agent_instance', label: `Instancia: ${shortAgentInstanceID(agentInstanceFilter)}` },
    providerFilter && { key: 'provider', label: `Proveedor: ${providerFilter}` },
    modelFilter && { key: 'model', label: `Modelo: ${modelFilter}` },
    agentFilter && { key: 'agent', label: `Agente: ${agentFilter}` },
    customDateRangeActive && { key: 'period', label: `Periodo: ${fromDate} → ${toDate}` },
  ].filter((filter): filter is { key: string; label: string } => Boolean(filter))
  const clearCostFilter = (key: string) => {
    if (key === 'client') {
      setClientFilter('')
      setProjectFilter('')
      setEpicFilterInput('')
      setTaskFilter('')
    } else if (key === 'project') {
      setProjectFilter('')
      setEpicFilterInput('')
      setTaskFilter('')
    } else if (key === 'epic') {
      setEpicFilterInput('')
      setTaskFilter('')
    } else if (key === 'task') {
      setTaskFilter('')
    } else if (key === 'step') {
      setStepFilterInput('')
    } else if (key === 'provider') {
      setProviderFilter('')
      setModelFilter('')
    } else if (key === 'model') {
      setModelFilter('')
    } else if (key === 'agent') {
      setAgentFilter('')
    } else if (key === 'agent_instance') {
      setAgentInstanceInput('')
    } else if (key === 'period') {
      setFromDate('')
      setToDate('')
    }
    if (key === 'client' || key === 'epic' || key === 'step' || key === 'period') resetCostPages()
    else resetLedgerPage()
  }
  const clearCostFilters = () => {
    setClientFilter('')
    setProjectFilter('')
    setEpicFilterInput('')
    setTaskFilter('')
    setStepFilterInput('')
    setAgentFilter('')
    setAgentInstanceInput('')
    setProviderFilter('')
    setModelFilter('')
    setFromDate('')
    setToDate('')
    resetCostPages()
  }
  const filterByProject = (projectId: string) => {
    const selectedProject = projectList.data?.find((project) => project.id === projectId)
    if (selectedProject) setClientFilter(selectedProject.client_id)
    setProjectFilter(projectId)
    setEpicFilterInput('')
    setTaskFilter('')
    setEpicOptionsCursor(undefined)
    resetLedgerPage()
    setAnalysisOpen(true)
    setRecentOpen(true)
  }
  const changeProjectFilter = (projectId: string) => {
    const selectedProject = projectList.data?.find((project) => project.id === projectId)
    if (projectId && selectedProject) setClientFilter(selectedProject.client_id)
    setProjectFilter(projectId)
    setEpicFilterInput('')
    setTaskFilter('')
    setEpicOptionsCursor(undefined)
    resetCostPages()
  }
  const changeClientFilter = (clientId: string) => {
    setClientFilter(clientId)
    setProjectFilter('')
    setEpicFilterInput('')
    setTaskFilter('')
    setEpicOptionsCursor(undefined)
    resetCostPages()
  }
  const changeEpicFilter = (value: string) => {
    setEpicFilterInput(value)
    setTaskFilter('')
    resetCostPages()
  }
  const changeStepFilter = (value: string) => {
    setStepFilterInput(value)
    resetCostPages()
  }
  const filterByModel = (provider: string, model: string) => {
    setProviderFilter(provider)
    setModelFilter(model)
    resetLedgerPage()
    setAnalysisOpen(true)
    setRecentOpen(true)
  }
  const filterByWorkItem = (workItemId: string) => {
    setTaskFilter(workItemId)
    resetLedgerPage()
    setAnalysisOpen(true)
    setRecentOpen(true)
  }
  const filterByAgent = (agentKey: string) => {
    setAgentFilter(agentKey)
    resetLedgerPage()
    setAnalysisOpen(true)
    setRecentOpen(true)
  }
  const filterByAgentInstance = (instanceID: string) => {
    const normalized = normalizeAgentInstanceID(instanceID)
    if (!normalized) return
    setAgentInstanceInput(normalized)
    resetLedgerPage()
    setAnalysisOpen(true)
    setRecentOpen(true)
  }
  const loadMoreWorkItemCosts = () => {
    if (!workItemNextCursor || isValidating) return
    setWorkItemCosts((current) => current.scopeKey === workItemCostScopeKey
      ? { ...current, cursor: workItemNextCursor }
      : current)
  }
  const loadMoreAgentInstanceCosts = () => {
    if (!agentInstanceNextCursor || isAgentInstanceCostValidating) return
    setAgentInstanceCosts((current) => current.scopeKey === agentInstanceCostScopeKey
      ? { ...current, cursor: agentInstanceNextCursor }
      : current)
  }
  const cacheRate =
    summary && summary.input_tokens > 0
      ? Math.round((summary.cached_input_tokens / summary.input_tokens) * 100)
      : 0
  const trackedExecutionCount = summary?.executions ?? 0

  const guardrails = useMemo<GuardrailItem[]>(
    () => [
      ...(data?.budget_watch ?? []).map((project) => ({
        id: `project:${project.project_id}`,
        title: project.project_name,
        context: 'Proyecto',
        href: `/automation/projects/${project.project_id}`,
        status: project.status,
        usagePercent: project.usage_percent,
        spentMicrousd: project.spent_microusd,
        reservedMicrousd: project.reserved_microusd,
        remainingMicrousd: project.remaining_microusd,
        budgetMicrousd: project.monthly_budget_microusd,
        alertPercent: project.alert_percent,
        kind: 'project' as const,
      })),
      ...(data?.task_budget_watch ?? []).map((workItem) => ({
        id: `task:${workItem.work_item_id}`,
        title: workItem.work_item_title,
        context: workItem.project_name,
        href: `/automation/work-items/${workItem.work_item_id}?view=activity&usage=1`,
        status: workItem.status,
        usagePercent: workItem.usage_percent,
        spentMicrousd: workItem.spent_microusd,
        reservedMicrousd: workItem.reserved_microusd,
        remainingMicrousd: workItem.remaining_microusd,
        budgetMicrousd: workItem.budget_microusd,
        alertPercent: workItem.alert_percent,
        kind: 'task' as const,
      })),
    ],
    [data?.budget_watch, data?.task_budget_watch]
  )

  const attentionGuardrails = guardrails.filter((item) => item.status !== 'healthy' || hasIncompleteTotalCost)
  const visibleGuardrails = [...attentionGuardrails, ...guardrails.filter((item) => item.status === 'healthy' && !hasIncompleteTotalCost)].slice(
    0,
    2
  )
  const visibleGuardrailIDs = new Set(visibleGuardrails.map((item) => item.id))
  const remainingGuardrails = guardrails.filter((item) => !visibleGuardrailIDs.has(item.id))
  const hasExceededGuardrail = attentionGuardrails.some((item) => item.status === 'exceeded')
  const hasAttentionGuardrail = attentionGuardrails.length > 0
  const primaryGuardrail = attentionGuardrails[0]
  const controlState = hasExceededGuardrail
    ? {
        label: 'Intervención requerida',
        detail: hasIncompleteTotalCost
          ? 'El límite ya se alcanzó con los costos conocidos; hay ejecuciones sin precio o falta cobertura, así que el gasto real podría ser mayor.'
          : 'Una ejecución quedó protegida por su límite.',
        tone: 'bg-rose-500',
        icon: ExclamationTriangleIcon,
      }
    : hasIncompleteTotalCost && guardrails.length > 0
      ? {
          label: 'Presupuesto no confirmable',
          detail: 'Hay ejecuciones sin precio confirmado o falta cobertura del ledger. El gasto y el margen visibles pueden ser subtotales; no prueban que el presupuesto esté en rango.',
          tone: 'bg-amber-400',
          icon: ExclamationTriangleIcon,
        }
    : hasIncompleteTotalCost
      ? {
          label: 'Coste no confirmado',
          detail: 'El total del conjunto filtrado puede ser sólo un subtotal porque hay importes sin precio o falta cobertura. No se estima el costo faltante.',
          tone: 'bg-amber-400',
          icon: ExclamationTriangleIcon,
        }
    : hasAttentionGuardrail
      ? {
          label: 'Una decisión se acerca',
          detail: 'Revisa el margen disponible antes de autorizar más trabajo.',
          tone: 'bg-amber-400',
          icon: ExclamationTriangleIcon,
        }
      : {
          label: guardrails.length ? 'Consumo dentro del presupuesto' : 'Sin límites de presupuesto configurados',
          detail: guardrails.length
            ? 'El consumo sigue dentro de los límites definidos.'
            : 'Registrar el consumo no impone un tope. Configura un presupuesto antes de ampliar el trabajo autónomo.',
          tone: guardrails.length ? 'bg-emerald-400' : 'bg-sky-400',
          icon: guardrails.length ? ShieldCheckIcon : SparklesIcon,
        }
  const ControlIcon = controlState.icon
  const leadingStage = useMemo(
    () =>
      [...(data?.by_step ?? [])].sort(
        (left, right) => right.total_cost_microusd - left.total_cost_microusd
      )[0],
    [data?.by_step]
  )
  const pageCostMicrousd = recentExecutions
    .filter(hasKnownExecutionPrice)
    .reduce((total, execution) => total + execution.total_cost_microusd, 0)
  const recentPreview = recentExecutions.slice(0, 4)
  const remainingRecentExecutions = recentExecutions.slice(4)
  const sessionRecoveryMessage = localSessionRecoveryMessage(error)
  const errorStatus = (error as { response?: { status?: number } } | undefined)?.response?.status
  const errorCopy =
    sessionRecoveryMessage ??
    (errorStatus === 401
      ? 'Tu sesión venció. Inicia sesión de nuevo para recuperar el pulso.'
      : errorStatus === 403
        ? 'No tienes acceso a esta vista de consumo.'
        : 'No pudimos sincronizar el consumo. Esta vista no confirma si los agentes siguen trabajando.')
  const ledgerStatus = hasPartialLedger || hasUnpricedExecutions || hasUnconfirmedPricingCoverage
    ? {
        label: hasUnpricedExecutions
          ? 'Precios incompletos'
          : hasUnconfirmedPricingCoverage
            ? 'Cobertura de precios no confirmada'
            : 'Lectura parcial',
        detail: hasUnpricedExecutions && hasPartialLedger
          ? `Hay ${unpricedExecutionCountCopy} sin base de precio en el conjunto filtrado y falta ${unknownLedgerDimensionLabels.join(', ') || 'cobertura del ledger'}. El total es sólo el subtotal registrado; no se estima el costo faltante.`
          : hasUnpricedExecutions
            ? `Hay ${unpricedExecutionCountCopy} sin base de precio en el conjunto filtrado. Las filas muestran “No disponible”; agregados y presupuestos son subtotales, sin estimar el costo faltante.`
            : hasUnconfirmedPricingCoverage
              ? 'Esta respuesta antigua no informa cuántas ejecuciones carecen de precio y la página cargada no contiene todos los resultados. Los importes son subtotales; el presupuesto no puede confirmarse.'
              : hasIncompleteTotalCost
                ? `Falta ${unknownLedgerDimensionLabels.join(', ') || 'una fuente de costos'}. El total es sólo el subtotal registrado; los importes faltantes no equivalen a $0.`
                : unknownLedgerDimensionLabels.length > 0
                  ? `No están disponibles: ${unknownLedgerDimensionLabels.join(', ')}. Esos importes se muestran como “No disponible”, no como $0.`
                  : 'Algunas dimensiones de uso todavía no están disponibles; los importes afectados no se interpretan como $0.',
        tone: 'bg-amber-400',
      }
    : {
        label: isValidating ? 'Sincronizando' : 'Consumo registrado',
        detail: '',
        tone: controlState.tone,
      }

  const renderGuardrail = (item: GuardrailItem) => {
    const hasUnconfirmedHealthyStatus = hasIncompleteTotalCost && item.status === 'healthy'
    const status = budgetStatus(hasUnconfirmedHealthyStatus ? 'attention' : item.status)
    const typeLabel = item.kind === 'task' ? 'Entrega' : 'Proyecto'

    return (
      <li key={item.id}>
        <Link
          href={item.href}
          className="premium-surface-interactive group block rounded-2xl border border-border-subtle bg-surface-raised p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
              </span>
              <span className="mt-1 block truncate text-xs text-ink-muted">
                {typeLabel} · {item.context}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge color={status.color}>{hasUnconfirmedHealthyStatus ? 'Cobertura parcial' : status.label}</Badge>
              <ArrowRightIcon className="size-3.5 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-(--tenant-accent)" />
            </span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <span>
              <span className="block text-lg font-semibold tracking-tight text-ink tabular-nums">
                {hasIncompleteTotalCost ? `≥${clampPercent(item.usagePercent)}%` : `${clampPercent(item.usagePercent)}%`}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {hasIncompleteTotalCost ? 'Margen no confirmado' : `${money(item.remainingMicrousd)} disponibles`}
              </span>
            </span>
            <span className="text-right text-[11px] leading-4 text-ink-muted">
              <span className="block">
                {money(item.spentMicrousd)} + {money(item.reservedMicrousd)}
              </span>
              <span className="block">alerta {item.alertPercent}%</span>
            </span>
          </div>
          <span
            className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-interactive"
            aria-label={`${hasIncompleteTotalCost ? 'Al menos ' : ''}${clampPercent(item.usagePercent)}% de ${money(item.budgetMicrousd)} comprometido`}
          >
            <span
              className={`block h-full rounded-full ${status.meter}`}
              style={{ width: `${clampPercent(item.usagePercent)}%` }}
            />
          </span>
        </Link>
      </li>
    )
  }

  const renderExecution = (execution: RecentExecution) => {
    const stateFailed = execution.task_status === 'failed'

    return (
      <li key={execution.id} className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                role="img"
                className={`size-2 rounded-full ${stateFailed ? 'bg-rose-500' : 'bg-emerald-400'}`}
                aria-label={stateFailed ? 'Ejecución fallida' : 'Ejecución completada'}
              />
              <p className="font-semibold text-ink">{executionLabel(execution.operation)}</p>
              <Badge color={stateFailed ? 'rose' : 'emerald'}>{stateFailed ? 'Falló' : 'Completada'}</Badge>
              {execution.execution_kind === 'tool' && (
                <Badge color="indigo">{execution.tool || 'Herramienta'}</Badge>
              )}
              <span className="truncate text-xs text-ink-muted">
                {execution.provider} · {execution.model}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {formatWhen(execution.completed_at)} · {shortUsage(execution)}
            </p>
            {(execution.project_name || execution.work_item_title || execution.agent_key) && (
              <p className="mt-1 text-xs text-ink-muted">
                {[execution.project_name, execution.work_item_title, execution.agent_key ? `Agente ${execution.agent_key}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
            {execution.agent_instance_id ? (
              normalizeAgentInstanceID(execution.agent_instance_id) ? (
                <p className="mt-1 break-all text-xs text-ink-muted">
                  Instancia:{' '}
                  <button
                    type="button"
                    title={execution.agent_instance_id}
                    aria-label={`Filtrar costos por instancia: ${execution.agent_instance_id}`}
                    onClick={() => filterByAgentInstance(execution.agent_instance_id ?? '')}
                    className="font-mono text-(--tenant-accent) hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                  >
                    {execution.agent_instance_id}
                  </button>
                </p>
              ) : <p className="mt-1 text-xs text-ink-muted">Instancia: identificador no válido</p>
            ) : <p className="mt-1 text-xs text-ink-muted">Instancia: sin atribución registrada</p>}
            {execution.delivery_work_item_id && (
              <Link
                href={`/automation/work-items/${execution.delivery_work_item_id}?view=activity&task=${encodeURIComponent(execution.automation_task_id)}&execution=${encodeURIComponent(execution.id)}&execution_kind=${encodeURIComponent(execution.execution_kind)}`}
                className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-(--tenant-accent) transition hover:underline"
              >
                Abrir en el flujo <ArrowRightIcon className="size-3" />
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm font-semibold text-ink tabular-nums">{executionCostMoney(execution)}</span>
            <button
              type="button"
              onClick={() =>
                setSelectedExecution({
                  id: execution.id,
                  taskId: execution.automation_task_id,
                  kind: execution.execution_kind,
                })
              }
              onPointerEnter={preloadExecutionDetail}
              onPointerDown={preloadExecutionDetail}
              onFocus={preloadExecutionDetail}
              className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
            >
              {stateFailed ? 'Revisar fallo' : 'Ver detalle'}
            </button>
          </div>
        </div>
        <details
          open={expandedCostExecutionId === execution.id}
          onToggle={(event) => setExpandedCostExecutionId(event.currentTarget.open ? execution.id : null)}
          className="mt-3 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2"
        >
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-ink-secondary">
            Ver desglose de coste
          </summary>
          {expandedCostExecutionId === execution.id && <><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {[
              { label: 'Entrada', dimension: 'input_cost_micros', value: execution.input_cost_microusd },
              { label: 'Salida', dimension: 'output_cost_micros', value: execution.output_cost_microusd },
              { label: 'Cache leída', dimension: 'cached_cost_micros', value: execution.cached_cost_microusd },
              { label: 'Cache escrita', dimension: 'cache_write_cost_micros', value: execution.cache_write_cost_microusd },
            ].map(({ label, dimension, value }) => (
              <div key={String(label)} className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-medium text-ink tabular-nums">
                  {hasKnownExecutionPrice(execution) ? ledgerDimensionMoney(value, dimension, unknownLedgerDimensions) : 'No disponible'}
                </dd>
              </div>
            ))}
          </dl>
          {execution.pricing_basis && <p className="mt-3 text-xs text-ink-muted">{execution.pricing_basis}</p>}</>}
        </details>
      </li>
    )
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <PageHeader
          eyebrow="Automatización"
          title="Uso y costos"
          description="Revisa el consumo y define cuánto puede gastar cada proyecto."
          icon={ChartBarSquareIcon}
          actions={error ? null :
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-border-subtle bg-surface-raised p-1" role="group" aria-label="Rango de tiempo">
                {[7, 30, 90, 180, 365].map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => {
                      setDays(range)
                      setFromDate('')
                      setToDate('')
                      resetLedgerPage()
                    }}
                    aria-pressed={!customDateRangeActive && days === range}
                    className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 ${
                      !customDateRangeActive && days === range
                        ? 'bg-(--tenant-accent) text-white shadow-sm'
                        : 'text-ink-secondary hover:bg-surface-soft'
                    }`}
                  >
                    {range} días
                  </button>
                ))}
              </div>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary">
                Desde
                <input
                  type="date"
                  aria-label="Desde"
                  value={fromDate}
                  max={toDate || todayDate}
                  onChange={(event) => {
                    setFromDate(event.target.value)
                    resetCostPages()
                  }}
                  className="min-w-0 bg-transparent text-xs font-medium text-ink outline-none"
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary">
                Hasta
                <input
                  type="date"
                  aria-label="Hasta"
                  value={toDate}
                  min={fromDate || undefined}
                  max={todayDate}
                  onChange={(event) => {
                    setToDate(event.target.value)
                    resetCostPages()
                  }}
                  className="min-w-0 bg-transparent text-xs font-medium text-ink outline-none"
                />
              </label>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('')
                    setToDate('')
                    resetCostPages()
                  }}
                  className="min-h-11 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft"
                >
                  Limpiar fechas
                </button>
              )}
              <button
                type="button"
                aria-label="Actualizar uso y costos"
                onClick={() => void mutate()}
                className="inline-flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-raised text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
              >
                <ArrowPathIcon className={`size-4 ${isValidating ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              </button>
            </div>
          }
        />

        {customDateRangeIncomplete && (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[.07] px-4 py-3 text-xs text-amber-900" role="status">
            Selecciona ambas fechas para aplicar el periodo personalizado; mientras tanto se conserva el rango actual.
          </p>
        )}

        {isLoading ? (
          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando uso y costos">
            <div className="h-58 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
            <div className="h-58 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
            <div className="xl:col-span-2 h-38 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
          </section>
        ) : error && !data ? (
          <section className="premium-surface mt-5 overflow-hidden rounded-[1.75rem]">
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 text-left sm:px-5 sm:py-5">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-600">
                <ArrowPathIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">{sessionRecoveryMessage ? 'La sesión local necesita atención' : 'La lectura de guardrails está sin conexión'}</h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-ink-muted">{errorCopy}</p>
              </div>
              <button
                type="button"
                onClick={() => void mutate()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-ink transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 sm:w-auto"
              >
                <ArrowPathIcon className="size-4" />
                {sessionRecoveryMessage ? 'Actualizar sesión' : 'Sincronizar de nuevo'}
              </button>
            </div>
          </section>
        ) : (
          <>
            {error && data ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[.07] px-4 py-3 text-xs text-amber-900" role="alert">
                <span>{errorCopy} Se conservan los datos ya cargados.</span>
                <button type="button" onClick={() => void mutate()} className="min-h-10 rounded-lg border border-amber-500/35 px-3 font-semibold hover:bg-amber-400/10">
                  Sincronizar de nuevo
                </button>
              </div>
            ) : null}
            <section
              aria-label="Pulso de consumo"
              className="premium-surface relative mt-5 overflow-hidden rounded-[1.75rem]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-(--tenant-accent)/35" />
              <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_11rem] xl:items-stretch">
                <div className="flex min-w-0 flex-col justify-between">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-(--tenant-accent)/18 bg-(--tenant-accent)/[.07] px-3 py-1.5 text-xs font-semibold text-(--tenant-accent)">
                      <span className="relative flex size-2">
                        <span
                          className={`absolute inline-flex size-2 rounded-full ${ledgerStatus.tone} ${
                            isValidating ? 'animate-ping motion-reduce:animate-none' : ''
                          }`}
                        />
                        <span className={`relative inline-flex size-2 rounded-full ${ledgerStatus.tone}`} />
                      </span>
                      {ledgerStatus.label}
                    </span>
                    <div className="mt-4 flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                        <ControlIcon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Autonomía y guardrails</p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                          {controlState.label}
                        </h2>
                        <p className="mt-1 text-sm text-ink-secondary">{controlState.detail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
                    <div>
                        <p className="text-xs font-medium text-ink-muted">
                          {hasIncompleteTotalCost
                            ? `Subtotal registrado · ${customDateRangeActive ? `${fromDate} a ${toDate}` : `${data?.range_days ?? days} días`}`
                            : customDateRangeActive ? `Uso registrado · ${fromDate} a ${toDate}` : `Uso registrado · ${data?.range_days ?? days} días`}
                      </p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">
                        {money(summary?.total_cost_microusd)}
                      </p>
                    </div>
                    <div className="border-l border-border-subtle pl-5">
                      <p className="text-xs font-medium text-ink-muted">Movimientos</p>
                      <p className="mt-1 text-sm font-semibold text-ink tabular-nums">{number(trackedExecutionCount)} registrados</p>
                    </div>
                    {leadingStage && (
                      <div className="border-l border-border-subtle pl-5">
                        <p className="text-xs font-medium text-ink-muted">Etapa con mayor uso</p>
                        <p className="mt-1 text-sm font-semibold text-ink">{executionLabel(leadingStage.key)}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {costShare(leadingStage.total_cost_microusd, summary?.total_cost_microusd)}% del coste
                        </p>
                      </div>
                    )}
                  </div>
                  {primaryGuardrail && (
                    <Link
                      href={primaryGuardrail.href}
                      className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 ${primaryGuardrail.status === 'exceeded' ? 'border-rose-500/30 bg-rose-500/[.06] text-rose-700 hover:bg-rose-500/[.1] dark:text-rose-300' : 'border-amber-500/30 bg-amber-500/[.07] text-amber-800 hover:bg-amber-500/[.12] dark:text-amber-300'}`}
                    >
                      Revisar {primaryGuardrail.kind === 'task' ? 'entrega' : 'proyecto'}: <span className="max-w-56 truncate">{primaryGuardrail.title}</span>
                      <ArrowRightIcon className="size-3.5 shrink-0" />
                    </Link>
                  )}
                </div>
                <div className="grid gap-3">
                  {[
                    {
                      label: 'Límites',
                      value: number(guardrails.length),
                      detail: hasAttentionGuardrail ? 'requieren revisión' : 'activos',
                      icon: ShieldCheckIcon,
                    },
                  ].map(({ label, value, detail, icon: Icon }) => (
                    <article
                      key={label}
                      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-soft/70 p-3.5 xl:flex-col xl:items-start"
                    >
                      <Icon className="size-4 shrink-0 text-(--tenant-accent)" />
                      <div><p className="text-[11px] font-semibold tracking-[.12em] text-ink-muted uppercase">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular-nums">{value}</p><p className="mt-0.5 text-xs text-ink-muted">{detail}</p></div>
                    </article>
                  ))}
                </div>
                {(hasPartialLedger || hasUnpricedExecutions || hasUnconfirmedPricingCoverage) && (
                  <p role="status" aria-live="polite" className="col-span-full -mt-1 flex items-center gap-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                    {ledgerStatus.detail}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
              <section className="premium-surface overflow-hidden rounded-[1.75rem]" aria-labelledby="guardrails-title">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Límites</p>
                    <h2 id="guardrails-title" className="mt-1 text-lg font-semibold text-ink">
                      {hasAttentionGuardrail ? 'Protecciones que necesitan revisión' : guardrails.length ? 'Presupuestos sin alertas' : 'Configura tus límites'}
                    </h2>
                  </div>
                  <Badge color={hasExceededGuardrail ? 'rose' : hasAttentionGuardrail ? 'amber' : 'emerald'}>
                    {hasAttentionGuardrail ? `${attentionGuardrails.length} señal${attentionGuardrails.length === 1 ? '' : 'es'}` : guardrails.length ? 'Sin alertas de presupuesto' : 'Sin configurar'}
                  </Badge>
                </header>
                {guardrails.length === 0 ? (
                  <div className="flex min-h-42 flex-col items-start justify-center px-5 py-6 sm:px-6">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-600">
                      <ShieldCheckIcon className="size-4" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-ink">Sin límites adicionales a nivel portafolio.</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">La trazabilidad no sustituye un presupuesto. Define un tope por proyecto para controlar las siguientes ejecuciones.</p>
                    <Link
                      href="/automation/projects"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-(--tenant-accent) hover:underline"
                    >
                      Gestionar proyectos <ArrowRightIcon className="size-3" />
                    </Link>
                  </div>
                ) : (
                  <>
                    <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">{visibleGuardrails.map(renderGuardrail)}</ul>
                    {remainingGuardrails.length > 0 && (
                      <details className="group border-t border-border-subtle">
                        <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-ink sm:px-6">
                          Ver {remainingGuardrails.length} protección{remainingGuardrails.length === 1 ? '' : 'es'} más
                          <ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <ul className="grid gap-3 border-t border-border-subtle p-4 sm:grid-cols-2 sm:p-5">
                          {remainingGuardrails.map(renderGuardrail)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </section>

              <section className="premium-surface overflow-hidden rounded-[1.75rem]" aria-labelledby="efficiency-title">
                <header className="border-b border-border-subtle px-5 py-4 sm:px-6">
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Eficiencia</p>
                  <h2 id="efficiency-title" className="mt-1 text-lg font-semibold text-ink">
                    El contexto también es ahorro
                  </h2>
                </header>
                <div className="p-5 sm:p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight text-ink tabular-nums">{cacheRate}%</p>
                      <p className="mt-1 text-sm text-ink-secondary">de entrada reutilizada</p>
                    </div>
                    <CircleStackIcon className="size-9 text-(--tenant-accent)/75" />
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-interactive">
                    <span
                      className="block h-full rounded-full bg-(--tenant-accent)"
                      style={{ width: `${clampPercent(cacheRate)}%` }}
                    />
                  </div>
                  <details className="group mt-4 rounded-xl bg-surface-soft">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-ink-secondary">
                      Métricas técnicas
                      <ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                    </summary>
                    <div className="grid grid-cols-2 gap-3 border-t border-border-subtle p-3">
                      <div>
                        <p className="text-[11px] font-semibold tracking-[.1em] text-ink-muted uppercase">Tokens leídos</p>
                        <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
                          {number(summary?.cached_input_tokens)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold tracking-[.1em] text-ink-muted uppercase">Tokens escritos</p>
                        <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
                          {number(summary?.cache_write_tokens)}
                        </p>
                      </div>
                      <div className="col-span-2 flex items-center justify-between border-t border-border-subtle pt-3">
                        <span className="text-xs text-ink-muted">Tokens procesados</span>
                        <span className="text-sm font-semibold text-ink tabular-nums">{number(summary?.total_tokens)}</span>
                      </div>
                    </div>
                  </details>
                </div>
              </section>
            </section>

            <section className="premium-surface mt-4 overflow-hidden rounded-[1.5rem]" aria-labelledby="work-item-costs-title">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Detalle del consumo</p>
                  <h2 id="work-item-costs-title" className="mt-1 text-lg font-semibold text-ink">Consumo por tarea</h2>
                  <p className="mt-1 text-xs text-ink-muted">Ordenado por coste; cada página conserva el proyecto y los filtros seleccionados.</p>
                </div>
                <Badge color="zinc">{number(scopedWorkItemCosts.length)} cargadas</Badge>
              </header>
              {scopedWorkItemCosts.length === 0 ? (
                <div className="px-5 py-7 text-sm text-ink-muted sm:px-6">
                  {taskFilter ? 'No hay tareas con coste para estos filtros.' : 'Todavía no hay tareas con coste en este rango.'}
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {scopedWorkItemCosts.map((row) => (
                    <li key={row.work_item_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <Link href={`/automation/work-items/${row.work_item_id}`} className="block truncate text-sm font-semibold text-ink hover:text-(--tenant-accent)">
                          {row.work_item_title}
                        </Link>
                        <p className="mt-1 text-xs text-ink-muted">
                          {row.project_name} · {number(row.executions)} llamadas · {number(row.total_tokens)} tokens
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                        <button
                          type="button"
                          aria-label={`Filtrar costos por tarea: ${row.work_item_title}`}
                          onClick={() => filterByWorkItem(row.work_item_id)}
                          className="inline-flex min-h-10 items-center rounded-lg border border-border-subtle px-3 text-xs font-semibold text-ink-secondary hover:bg-surface-soft"
                        >
                          Filtrar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {workItemNextCursor ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 sm:px-6">
                  <p className="text-xs text-ink-muted">Mostrando {number(scopedWorkItemCosts.length)} tareas. Puedes cargar más sin perder las anteriores.</p>
                  <button
                    type="button"
                    disabled={isValidating || Boolean(error)}
                    onClick={loadMoreWorkItemCosts}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-45"
                  >
                    {isValidating ? 'Cargando…' : 'Cargar más tareas'}
                  </button>
                </div>
              ) : scopedWorkItemCosts.length > 0 ? (
                <p className="border-t border-border-subtle px-5 py-4 text-xs text-ink-muted sm:px-6" role="status">
                  Fin de resultados · {number(scopedWorkItemCosts.length)} tareas con coste.
                </p>
              ) : null}
            </section>

            <details className="group premium-surface mt-4 overflow-hidden rounded-[1.75rem]" aria-labelledby="cost-flow-title">
              <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Uso por etapa</p>
                  <h2 id="cost-flow-title" className="mt-1 text-lg font-semibold text-ink">Dónde trabaja el agente</h2>
                </div>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-xs font-semibold text-ink-muted">
                  <span className={`size-2 rounded-full ${isValidating ? 'animate-pulse motion-reduce:animate-none' : ''} bg-(--tenant-accent)`} />
                  <span className="group-open:hidden">Explorar</span><span className="hidden group-open:inline">Ocultar</span>
                  <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </span>
              </summary>
              <div className="border-t border-border-subtle">
              {byStep.length === 0 ? (
                <div className="flex min-h-34 items-center px-5 text-sm text-ink-muted sm:px-6">
                  La ruta aparecerá con el primer movimiento costeado.
                </div>
              ) : (
                <ol className="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(11.5rem,1fr)] gap-3 overflow-x-auto overscroll-x-contain p-4 scroll-smooth [-webkit-overflow-scrolling:touch] motion-reduce:scroll-auto sm:grid-flow-row sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
                  {byStep.map((row, index) => {
                    const share = costShare(row.total_cost_microusd, summary?.total_cost_microusd)
                    const stageTone = index === 0 ? 'bg-(--tenant-accent)' : 'bg-sky-400'
                    return (
                      <li key={row.key} className="snap-start">
                        <article className="relative h-full rounded-2xl border border-border-subtle bg-surface-soft/65 p-4">
                          <span className={`flex size-8 items-center justify-center rounded-full ${stageTone} text-xs font-bold text-white`}>
                            {index + 1}
                          </span>
                          <p className="mt-5 truncate text-sm font-semibold text-ink">{executionLabel(row.key)}</p>
                          <p className="mt-1 text-xs text-ink-muted">{shortUsage(row)}</p>
                          <p className="mt-4 text-lg font-semibold tracking-tight text-ink tabular-nums">
                            {money(row.total_cost_microusd)}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-(--tenant-accent)">{share}% del total</p>
                          <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-surface-interactive">
                            <span
                              className={`block h-full rounded-full ${stageTone}`}
                              style={{ width: `${Math.max(share, row.total_cost_microusd > 0 ? 5 : 0)}%` }}
                            />
                          </span>
                        </article>
                      </li>
                    )
                  })}
                </ol>
              )}
              {byOperation.length > 0 && (
                <details className="group border-t border-border-subtle">
                  <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-ink sm:px-6">
                    Ver operaciones y herramientas ({byOperation.length})
                    <ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                    {byOperation.map((row) => {
                      const share = costShare(row.total_cost_microusd, summary?.total_cost_microusd)
                      return (
                        <li
                          key={`${row.execution_kind ?? 'agent'}-${row.tool ?? 'agent'}-${row.key}`}
                          className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_9rem] sm:items-center sm:px-6"
                        >
                          <span className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {row.execution_kind === 'tool' ? row.tool || 'Herramienta' : 'Agente'} ·{' '}
                              {executionLabel(row.key)}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">{shortUsage(row)}</p>
                          </span>
                          <span className="text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-surface-interactive">
                            <span
                              className="block h-full rounded-full bg-(--tenant-accent)"
                              style={{ width: `${Math.max(share, row.total_cost_microusd > 0 ? 5 : 0)}%` }}
                            />
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
              </div>
            </details>

            <details
              open={analysisOpen}
              onToggle={(event) => setAnalysisOpen(event.currentTarget.open)}
              className="group premium-surface mt-4 overflow-hidden rounded-[1.75rem]"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                <span>
                  <span className="block text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Análisis</span>
                  <span className="mt-1 block text-lg font-semibold text-ink">Detalles y trazabilidad</span>
                </span>
                <span className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <span className="group-open:hidden">Explorar</span>
                  <span className="hidden group-open:inline">Ocultar</span>
                  <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </span>
              </summary>
              {analysisOpen && (
                <div className="border-t border-border-subtle p-4 sm:p-5">
            <section className="grid gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-[1.5rem] border border-border-subtle bg-surface-raised" aria-labelledby="portfolio-title">
                <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Portafolio</p>
                    <h2 id="portfolio-title" className="mt-1 text-lg font-semibold text-ink">
                      Consumo por proyecto
                    </h2>
                  </div>
                  <Badge color="zinc">{number(byProject.length)}</Badge>
                </header>
                {byProject.length === 0 ? (
                  <div className="px-5 py-8 sm:px-6">
                    <p className="text-sm font-semibold text-ink">Todavía no hay consumo en este rango</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">Cuando el agente ejecute una tarea, este reparto aparecerá automáticamente por proyecto.</p>
                    <Link href="/automation/projects" className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-(--tenant-accent)">
                      Ver resultados <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border-subtle">
                        {byProject.slice(0, 4).map((row) => {
                          const share = costShare(row.total_cost_microusd, summary?.total_cost_microusd)
                          const content = (
                          <>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-ink">{row.project_name}</span>
                              <span className="mt-1 block text-xs text-ink-muted">{shortUsage(row)}</span>
                            </span>
                            <span className="ml-4 flex shrink-0 items-center gap-2">
                              <span className="text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                              {row.project_id && <ArrowRightIcon className="size-3.5 text-ink-muted" />}
                            </span>
                          </>
                        )
                        return (
                          <li key={row.project_id ?? 'general'} className="relative">
                            {row.project_id ? (
                              <div className="flex items-stretch">
                                <button
                                  type="button"
                                  aria-label={`Filtrar costos por proyecto: ${row.project_name}`}
                                  onClick={() => filterByProject(row.project_id!)}
                                  className="premium-surface-interactive flex min-w-0 flex-1 items-center justify-between px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35 sm:px-6"
                                >
                                  {content}
                                </button>
                                <Link
                                  href={`/automation/projects/${row.project_id}`}
                                  aria-label={`Abrir proyecto: ${row.project_name}`}
                                  className="inline-flex min-h-11 shrink-0 items-center gap-1 border-l border-border-subtle px-3 text-xs font-semibold text-(--tenant-accent) hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35"
                                >
                                  Proyecto <ArrowRightIcon className="size-3" />
                                </Link>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-5 py-4 sm:px-6">{content}</div>
                            )}
                            <span className="absolute inset-x-5 bottom-0 h-px bg-(--tenant-accent)/25 sm:inset-x-6">
                              <span
                                className="block h-full bg-(--tenant-accent)"
                                style={{ width: `${Math.max(share, row.total_cost_microusd > 0 ? 5 : 0)}%` }}
                              />
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {byProject.length > 4 && (
                      <details className="group border-t border-border-subtle">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-ink sm:px-6">
                          Ver {byProject.length - 4} proyecto{byProject.length === 5 ? '' : 's'} más
                          <ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                          {byProject.slice(4).map((row) => (
                            <li key={row.project_id ?? `general-${row.project_name}`}>
                              <div className="flex items-stretch">
                                {row.project_id ? (
                                  <button
                                    type="button"
                                    aria-label={`Filtrar costos por proyecto: ${row.project_name}`}
                                    onClick={() => filterByProject(row.project_id!)}
                                    className="premium-surface-interactive flex min-w-0 flex-1 items-center justify-between gap-3 px-5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35 sm:px-6"
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-semibold text-ink">{row.project_name}</span>
                                      <span className="mt-1 block text-xs text-ink-muted">{shortUsage(row)}</span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                                  </button>
                                ) : (
                                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-5 py-3 sm:px-6">
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-semibold text-ink">{row.project_name}</span>
                                      <span className="mt-1 block text-xs text-ink-muted">{shortUsage(row)}</span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </section>

              <section className="overflow-hidden rounded-[1.5rem] border border-border-subtle bg-surface-raised" aria-labelledby="models-title">
                <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Capacidad</p>
                    <h2 id="models-title" className="mt-1 text-lg font-semibold text-ink">
                      Modelos en uso
                    </h2>
                  </div>
                  <Badge color="zinc">{number(byModel.length)}</Badge>
                </header>
                {byModel.length === 0 ? (
                  <div className="px-5 py-8 sm:px-6">
                    <p className="text-sm font-semibold text-ink">Aún no hubo llamadas de modelo</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">La capacidad y el coste aparecerán aquí en cuanto un flujo necesite usar IA.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                         {byModel.slice(0, 5).map((row) => {
                      const share = costShare(row.total_cost_microusd, summary?.total_cost_microusd)
                      return (
                        <li key={`${row.provider}:${row.model}`}>
                          <button
                            type="button"
                            aria-label={`Filtrar costos por modelo: ${row.provider} · ${row.model}`}
                            onClick={() => filterByModel(row.provider, row.model)}
                            className="premium-surface-interactive w-full px-5 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35 sm:px-6"
                          >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-ink">{row.model}</span>
                                <Badge color="zinc">{row.provider}</Badge>
                              </span>
                              <span className="mt-1 block text-xs text-ink-muted">{shortUsage(row)}</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                              {money(row.total_cost_microusd)}
                            </span>
                            <span className="ml-3 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-(--tenant-accent)">
                              Filtrar <ArrowRightIcon className="size-3" />
                            </span>
                          </div>
                          <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-interactive">
                            <span
                              className="block h-full rounded-full bg-sky-400"
                              style={{ width: `${Math.max(share, row.total_cost_microusd > 0 ? 5 : 0)}%` }}
                            />
                          </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </section>

            <section className="premium-surface mt-4 overflow-hidden rounded-[1.5rem]" aria-labelledby="agents-cost-title" aria-label="Consumo por agente">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Equipo</p>
                  <h2 id="agents-cost-title" className="mt-1 text-lg font-semibold text-ink">Consumo por agente</h2>
                  <p className="mt-1 text-xs text-ink-muted">Coste y actividad agregados por agente; selecciona uno para abrir su historial filtrado.</p>
                </div>
                <Badge color="zinc">{number(byAgent.length)} agentes</Badge>
              </header>
              {byAgent.length === 0 ? (
                <p className="px-5 py-7 text-sm text-ink-muted sm:px-6">No hay consumo atribuido a agentes en este rango.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {byAgent.map((row) => (
                    <li key={row.agent_key}>
                      <button
                        type="button"
                        aria-label={`Filtrar costos por agente: ${row.agent_key}`}
                        aria-pressed={agentFilter === row.agent_key}
                        onClick={() => filterByAgent(row.agent_key)}
                        className="premium-surface-interactive flex min-h-16 w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35 sm:px-6"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{row.agent_key}</span>
                          <span className="mt-1 block text-xs text-ink-muted">{number(row.executions)} llamadas · {number(row.total_tokens)} tokens</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-(--tenant-accent)">
                            {agentFilter === row.agent_key ? 'Filtrado' : 'Filtrar'} <ArrowRightIcon className="size-3" />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="premium-surface mt-4 overflow-hidden rounded-[1.5rem]" aria-labelledby="agent-instances-cost-title" aria-label="Consumo por instancia">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Ejecución local</p>
                  <h2 id="agent-instances-cost-title" className="mt-1 text-lg font-semibold text-ink">Consumo por instancia</h2>
                  <p className="mt-1 text-xs text-ink-muted">Costes agregados por agente e instancia, con identidades históricas no atribuidas explícitamente.</p>
                </div>
                <Badge color="zinc">{number(scopedAgentInstanceCosts.length)} cargadas</Badge>
              </header>
              {agentInstanceCostError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/25 bg-amber-400/[.06] px-5 py-3 text-xs text-amber-900 dark:text-amber-200 sm:px-6">
                  <span>{scopedAgentInstanceCosts.length > 0 ? 'No se pudo actualizar el desglose; se conserva la última página correcta.' : 'No se pudo cargar el desglose por instancia.'}</span>
                  <button type="button" onClick={() => void refreshAgentInstanceCosts()} className="min-h-10 rounded-lg border border-amber-500/35 px-3 font-semibold hover:bg-amber-400/10">
                    Reintentar
                  </button>
                </div>
              )}
              {isAgentInstanceCostLoading && scopedAgentInstanceCosts.length === 0 ? (
                <p role="status" aria-live="polite" aria-busy="true" className="flex min-h-24 items-center gap-2 px-5 text-sm text-ink-secondary sm:px-6">
                  <ArrowPathIcon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Consultando costes por agente e instancia…
                </p>
              ) : scopedAgentInstanceCosts.length === 0 && agentInstanceCostError ? null : scopedAgentInstanceCosts.length === 0 ? (
                <p className="px-5 py-7 text-sm text-ink-muted sm:px-6">No hay costes por instancia que coincidan con los filtros y el período seleccionados.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {scopedAgentInstanceCosts.map((row) => {
                    const instanceID = normalizeAgentInstanceID(row.agent_instance_id ?? '')
                    const attributed = row.instance_attributed && Boolean(instanceID)
                    return (
                      <li key={`${row.agent_key}:${row.agent_instance_id ?? 'unattributed'}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{row.agent_key || 'Agente no identificado'}</p>
                            <Badge color={attributed ? 'indigo' : 'amber'}>{attributed ? 'Instancia atribuida' : row.instance_attributed ? 'Identificador inválido' : 'Sin instancia atribuida'}</Badge>
                          </div>
                          {attributed ? (
                            <p className="mt-1 break-all font-mono text-xs text-ink-muted" title={instanceID}>ID {shortAgentInstanceID(instanceID)}…</p>
                          ) : (
                            <p className="mt-1 text-xs text-ink-muted">Gasto legacy conservado sin asociarlo a una máquina concreta.</p>
                          )}
                          <p className="mt-1 text-xs text-ink-muted">{number(row.executions)} llamadas · {number(row.total_tokens)} tokens</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-semibold text-ink tabular-nums">{money(row.total_cost_microusd)}</span>
                          {attributed ? (
                            <button
                              type="button"
                              aria-label={`Filtrar costos por instancia: ${instanceID}`}
                              aria-pressed={agentInstanceFilter === instanceID}
                              onClick={() => filterByAgentInstance(instanceID)}
                              className="inline-flex min-h-10 items-center rounded-lg border border-border-subtle px-3 text-xs font-semibold text-ink-secondary hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                            >
                              {agentInstanceFilter === instanceID ? 'Filtrado' : 'Filtrar'}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {agentInstanceNextCursor ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 sm:px-6">
                  <p className="text-xs text-ink-muted">Mostrando {number(scopedAgentInstanceCosts.length)} identidades. Las siguientes se cargan con cursor.</p>
                  <button
                    type="button"
                    disabled={isAgentInstanceCostValidating || Boolean(agentInstanceCostError)}
                    onClick={loadMoreAgentInstanceCosts}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-45"
                  >
                    {isAgentInstanceCostValidating ? 'Cargando…' : 'Cargar más instancias'}
                  </button>
                </div>
              ) : scopedAgentInstanceCosts.length > 0 ? (
                <p className="border-t border-border-subtle px-5 py-4 text-xs text-ink-muted sm:px-6" role="status">
                  Fin de resultados · {number(scopedAgentInstanceCosts.length)} identidades con coste.
                </p>
              ) : null}
            </section>

            <details
              open={recentOpen}
              onToggle={(event) => setRecentOpen(event.currentTarget.open)}
              className="group mt-4 overflow-hidden rounded-[1.5rem] border border-border-subtle bg-surface-raised"
              aria-labelledby="recent-title"
            >
              <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Trazabilidad</p>
                  <h2 id="recent-title" className="mt-1 text-lg font-semibold text-ink">
                    Movimiento reciente
                  </h2>
                </div>
                <span className="flex items-center gap-2"><Badge color="indigo">{number(recentPage.total)} llamadas</Badge><ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span>
              </summary>
              <div className="border-t border-border-subtle">
                <div className="border-b border-border-subtle bg-surface-soft/45 p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-client-filter">
                        Cliente
                        <select id="cost-client-filter" value={clientFilter} onChange={(event) => changeClientFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink">
                          <option value="">Todos los clientes</option>
                          {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-project-filter">
                        Proyecto
                        <select id="cost-project-filter" value={projectFilter} onChange={(event) => changeProjectFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink">
                          <option value="">Todos los proyectos</option>
                          {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
                      </label>
                      <div className="text-xs font-semibold text-ink-secondary">
                        <label htmlFor="cost-epic-filter">Épica</label>
                        <input
                          id="cost-epic-filter"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          list="cost-epic-options"
                          value={epicFilterInput}
                          aria-invalid={Boolean(epicFilterInput) && !epicFilter}
                          aria-describedby="cost-epic-filter-help"
                          onChange={(event) => changeEpicFilter(event.target.value)}
                          placeholder="Busca o pega UUID"
                          className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-mono text-xs font-normal text-ink placeholder:font-sans placeholder:text-ink-muted"
                        />
                        <datalist id="cost-epic-options">
                          {availableEpics.map((epic) => <option key={epic.id} value={epic.id} label={epic.title} />)}
                          {selectedEpicMissing && <option value={epicFilter} label="Épica actual · no cargada en esta página" />}
                        </datalist>
                        <p id="cost-epic-filter-help" className="mt-1 font-normal text-ink-muted">Elige un proyecto para explorar sus épicas o pega un UUID.</p>
                        {projectFilter && epicOptionsQuery.data?.next_cursor && (
                          <button
                            type="button"
                            onClick={() => setEpicOptionsCursor(epicOptionsQuery.data?.next_cursor)}
                            disabled={epicOptionsQuery.isValidating}
                            className="mt-1 min-h-9 font-semibold text-(--tenant-accent) hover:underline disabled:opacity-60"
                          >
                            {epicOptionsQuery.isValidating ? 'Cargando épicas…' : 'Cargar siguientes 100 épicas'}
                          </button>
                        )}
                        {projectFilter && epicOptionsQuery.error && <span role="status" className="mt-1 block font-normal text-amber-800">No se pudieron cargar las opciones; puedes pegar el UUID de la épica.</span>}
                      </div>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-task-filter">
                        Tarea / entrega
                        <select id="cost-task-filter" value={taskFilter} disabled={projectWorkItems.length === 0 && !taskFilter} onChange={(event) => { setTaskFilter(event.target.value); resetLedgerPage() }} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink disabled:opacity-60">
                          <option value="">Todas las tareas</option>
                          {selectedTaskMissing && <option value={taskFilter}>Selección actual (sin coincidencias con estos filtros)</option>}
                          {projectWorkItems.map((item) => <option key={item.work_item_id} value={item.work_item_id}>{item.work_item_title}</option>)}
                        </select>
                      </label>
                      <div className="text-xs font-semibold text-ink-secondary">
                        <label htmlFor="cost-step-filter">Paso</label>
                        <input
                          id="cost-step-filter"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={64}
                          list="cost-step-options"
                          value={stepFilterInput}
                          aria-invalid={Boolean(stepFilterInput) && !stepFilter}
                          aria-describedby="cost-step-filter-help"
                          onChange={(event) => changeStepFilter(event.target.value)}
                          placeholder="Clave del paso"
                          className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-mono text-xs font-normal text-ink placeholder:font-sans placeholder:text-ink-muted"
                        />
                        <datalist id="cost-step-options">
                          {availableStepKeys.map((stepKey) => <option key={stepKey} value={stepKey} />)}
                        </datalist>
                        <p id="cost-step-filter-help" className="mt-1 font-normal text-ink-muted">Minúsculas, 1–64 caracteres.</p>
                      </div>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-provider-filter">
                        Proveedor
                        <select id="cost-provider-filter" value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setModelFilter(''); resetLedgerPage() }} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink">
                          <option value="">Todos los proveedores</option>
                          {availableProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-model-filter">
                        Modelo
                        <select id="cost-model-filter" value={modelFilter} onChange={(event) => { setModelFilter(event.target.value); resetLedgerPage() }} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink">
                          <option value="">Todos los modelos</option>
                          {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-agent-filter">
                        Agente
                        <select id="cost-agent-filter" value={agentFilter} onChange={(event) => { setAgentFilter(event.target.value); resetLedgerPage() }} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink">
                          <option value="">Todos los agentes</option>
                          {availableAgents.map((agentKey) => <option key={agentKey} value={agentKey}>{agentKey}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-ink-secondary" htmlFor="cost-agent-instance-filter">
                        Instancia de agente
                        <input
                          id="cost-agent-instance-filter"
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={36}
                          list="cost-agent-instance-options"
                          value={agentInstanceInput}
                          aria-invalid={Boolean(agentInstanceInput) && !agentInstanceFilter}
                          aria-describedby="cost-agent-instance-help"
                          onChange={(event) => { setAgentInstanceInput(event.target.value); resetLedgerPage() }}
                          placeholder="Pega UUID de instancia"
                          className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 font-mono text-xs font-normal text-ink placeholder:font-sans placeholder:text-ink-muted"
                        />
                        <datalist id="cost-agent-instance-options">
                          {availableAgentInstances.map(({ id, agentKey }) => (
                            <option key={id} value={id} label={`${agentKey ? `Agente ${agentKey} · ` : ''}Instancia ${shortAgentInstanceID(id)}`} />
                          ))}
                        </datalist>
                      </label>
                    </div>
                    <p id="cost-agent-instance-help" className="mt-2 text-xs text-ink-muted">
                      Los UUID sugeridos vienen de las ejecuciones cargadas; también puedes pegar uno válido de un registro anterior.
                    </p>
                    {Boolean(agentInstanceInput) && !agentInstanceFilter && (
                      <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                        Usa un UUID completo válido. La consulta no enviará este valor hasta que coincida con ese formato.
                      </p>
                    )}
                    {Boolean(epicFilterInput) && !epicFilter && (
                      <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">Usa un UUID completo válido para filtrar por épica.</p>
                    )}
                    {Boolean(stepFilterInput) && !stepFilter && (
                      <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">La clave del paso debe empezar con una letra minúscula y tener hasta 64 caracteres (letras, números, guion o guion bajo).</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                      <p>Los filtros se aplican en el servidor a los agregados y al historial. Los límites de presupuesto muestran el estado actual del portafolio y no cambian con estos filtros.</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <p>
                          {number(recentPage.total)} coincidencia(s) · {hasIncompleteTotalCost ? 'subtotal conocido' : 'total'}: {money(pageCostMicrousd)}
                        </p>
                        {activeCostFilters.length > 0 && (
                          <button
                            type="button"
                            onClick={clearCostFilters}
                            className="min-h-11 font-semibold text-(--tenant-accent) hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                          >
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    </div>
                    {activeCostFilters.length > 0 && (
                      <ul aria-label="Filtros activos" className="mt-3 flex flex-wrap gap-2">
                        {activeCostFilters.map((filter) => (
                          <li key={filter.key}>
                            <button
                              type="button"
                              aria-label={`Quitar filtro: ${filter.label}`}
                              onClick={() => clearCostFilter(filter.key)}
                              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-3 text-xs font-medium text-ink-secondary hover:border-(--tenant-accent)/40 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                            >
                              {filter.label}<span aria-hidden="true">×</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!projectFilter && projectList.error && <p className="mt-2 text-xs text-amber-800">No se pudo cargar el selector de proyectos; los otros filtros siguen disponibles.</p>}
                </div>
                {recentExecutions.length === 0 ? (
                  <div className="flex min-h-32 items-center px-5 text-sm text-ink-muted sm:px-6">
                    {activeCostFilters.length > 0
                      ? 'No hay movimientos que coincidan con estos filtros en el período seleccionado.'
                      : 'Las llamadas del agente aparecerán aquí.'}
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border-subtle">{recentPreview.map(renderExecution)}</ul>
                    {remainingRecentExecutions.length > 0 && (
                      <details className="group border-t border-border-subtle">
                        <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-ink sm:px-6">
                          Ver {remainingRecentExecutions.length} registro{remainingRecentExecutions.length === 1 ? '' : 's'} más
                          <ChevronDownIcon className="size-4 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                          {remainingRecentExecutions.map(renderExecution)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              {(recentPage.total_pages > 1 || recentPage.has_more || page > 1) && (
                <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-xs text-ink-muted">
                    Página {page}{recentPage.total_pages > 0 ? ` de ${recentPage.total_pages}` : ''}{recentPage.mode === 'cursor' ? ' · continuación por cursor' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || isValidating}
                      onClick={() => {
                        const previousCursor = cursorHistory[cursorHistory.length - 1]
                        if (cursorHistory.length > 0) {
                          setCursorHistory((history) => history.slice(0, -1))
                          setCursor(previousCursor)
                        } else {
                          setCursor(null)
                        }
                        setPage((current) => Math.max(1, current - 1))
                        setSelectedExecution(null)
                      }}
                      className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-45"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={isValidating || !(recentPage.has_more ?? (page < recentPage.total_pages))}
                      onClick={() => {
                        if (recentPage.next_cursor) {
                          setCursorHistory((history) => [...history, cursor])
                          setCursor(recentPage.next_cursor)
                        } else {
                          setCursor(null)
                        }
                        setPage((current) => current + 1)
                        setSelectedExecution(null)
                      }}
                      className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-45"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
              </div>
            </details>
                </div>
              )}
            </details>
          </>
        )}
      </main>
      <Dialog open={Boolean(selectedExecution)} onClose={() => setSelectedExecution(null)} size="2xl">
        <DialogTitle>Detalle de ejecución</DialogTitle>
        <DialogBody className="max-h-[calc(100dvh-13rem)] overflow-y-auto overscroll-contain py-2 sm:max-h-[75vh]">
          {selectedExecution ? (
            <DeliveryResultPanel
              taskId={selectedExecution.taskId}
              executionId={selectedExecution.id}
              executionKind={selectedExecution.kind}
              onClose={() => setSelectedExecution(null)}
            />
          ) : null}
        </DialogBody>
      </Dialog>
    </PageTransition>
  )
}
