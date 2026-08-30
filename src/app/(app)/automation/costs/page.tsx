'use client'

import { Badge } from '@/components/badge'
import { Dialog, DialogBody, DialogTitle } from '@/components/dialog'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { deliveryCostRefreshInterval } from '@/features/automation/delivery-cost-refresh'
import { localSessionRecoveryMessage } from '@/lib/api'
import { automationCostsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
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
import { useMemo, useState } from 'react'
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
  summary: TokenCostDimensions & {
    executions: number
    tasks: number
  }
  by_operation: CostBreakdown[] | null
  by_step: CostBreakdown[] | null
  by_project: ProjectCostBreakdown[] | null
  by_model: ModelCostBreakdown[] | null
  budget_watch: ProjectBudgetWatch[] | null
  task_budget_watch: TaskBudgetWatch[] | null
  recent_execution_page?: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  recent_executions: RecentExecution[] | null
  ledger_coverage?: {
    state?: 'complete' | 'partial' | 'unavailable'
    agent_ledger?: boolean
    tool_ledger?: boolean
    unknown_dimensions?: string[]
  }
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

export default function AutomationCostsPage() {
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [expandedCostExecutionId, setExpandedCostExecutionId] = useState<string | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<{
    id: string
    taskId: string
    kind: 'agent' | 'tool'
  } | null>(null)
  const { data, error, isLoading, isValidating, mutate } = useSWR<CostOverview>(
    automationCostsPath(days, page),
    fetcher,
    {
      refreshInterval: deliveryCostRefreshInterval,
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  )

  const summary = data?.summary
  const byOperation = data?.by_operation ?? []
  const byStep = data?.by_step ?? []
  const byProject = data?.by_project ?? []
  const byModel = data?.by_model ?? []
  const recentExecutions = data?.recent_executions ?? []
  const recentPage = data?.recent_execution_page ?? {
    page,
    page_size: 40,
    total: recentExecutions.length,
    total_pages: 1,
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

  const attentionGuardrails = guardrails.filter((item) => item.status !== 'healthy')
  const visibleGuardrails = [...attentionGuardrails, ...guardrails.filter((item) => item.status === 'healthy')].slice(
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
        detail: 'Una ejecución quedó protegida por su límite.',
        tone: 'bg-rose-500',
        icon: ExclamationTriangleIcon,
      }
    : hasAttentionGuardrail
      ? {
          label: 'Una decisión se acerca',
          detail: 'El agente puede continuar dentro del margen disponible.',
          tone: 'bg-amber-400',
          icon: ExclamationTriangleIcon,
        }
      : {
          label: 'El agente puede continuar',
          detail: guardrails.length
            ? 'El consumo sigue dentro de los límites definidos.'
            : 'El consumo está trazado; puedes añadir un límite cuando haga falta.',
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
  const recentPreview = recentExecutions.slice(0, 4)
  const remainingRecentExecutions = recentExecutions.slice(4)
  const ledgerCoverage = data?.ledger_coverage
  const hasPartialLedger = ledgerCoverage?.state === 'partial'
  const sessionRecoveryMessage = localSessionRecoveryMessage(error)
  const errorStatus = (error as { response?: { status?: number } } | undefined)?.response?.status
  const errorCopy =
    sessionRecoveryMessage ??
    (errorStatus === 401
      ? 'Tu sesión venció. Inicia sesión de nuevo para recuperar el pulso.'
      : errorStatus === 403
        ? 'No tienes acceso a esta vista de consumo.'
        : 'El agente sigue trabajando; sólo esta lectura de guardrails no pudo sincronizarse.')
  const ledgerStatus = hasPartialLedger
    ? {
        label: 'Lectura parcial',
        detail: 'Algunas dimensiones técnicas todavía se están incorporando.',
        tone: 'bg-amber-400',
      }
    : {
        label: isValidating ? 'Sincronizando' : 'Control automático',
        detail: '',
        tone: controlState.tone,
      }

  const renderGuardrail = (item: GuardrailItem) => {
    const status = budgetStatus(item.status)
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
              <Badge color={status.color}>{status.label}</Badge>
              <ArrowRightIcon className="size-3.5 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-(--tenant-accent)" />
            </span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <span>
              <span className="block text-lg font-semibold tracking-tight text-ink tabular-nums">
                {clampPercent(item.usagePercent)}%
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {money(item.remainingMicrousd)} disponibles
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
            aria-label={`${clampPercent(item.usagePercent)}% de ${money(item.budgetMicrousd)} comprometido`}
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
            <span className="text-sm font-semibold text-ink tabular-nums">{money(execution.total_cost_microusd)}</span>
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
              ['Entrada', execution.input_cost_microusd],
              ['Salida', execution.output_cost_microusd],
              ['Cache leída', execution.cached_cost_microusd],
              ['Cache escrita', execution.cache_write_cost_microusd],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-medium text-ink tabular-nums">{money(Number(value))}</dd>
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
          description="El agente avanza dentro de límites claros."
          icon={ChartBarSquareIcon}
          actions={error ? null :
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-border-subtle bg-surface-raised p-1" role="group" aria-label="Rango de tiempo">
                {[7, 30, 90].map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => {
                      setDays(range)
                      setPage(1)
                      setSelectedExecution(null)
                    }}
                    aria-pressed={days === range}
                    className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 ${
                      days === range
                        ? 'bg-(--tenant-accent) text-white shadow-sm'
                        : 'text-ink-secondary hover:bg-surface-soft'
                    }`}
                  >
                    {range} días
                  </button>
                ))}
              </div>
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

        {isLoading ? (
          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando uso y costos">
            <div className="h-58 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
            <div className="h-58 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
            <div className="xl:col-span-2 h-38 animate-pulse rounded-[1.75rem] bg-surface-soft motion-reduce:animate-none" />
          </section>
        ) : error ? (
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
                      <p className="text-xs font-medium text-ink-muted">Uso registrado · {data?.range_days ?? days} días</p>
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
                {hasPartialLedger && (
                  <p className="col-span-full -mt-1 flex items-center gap-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
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
                      {hasAttentionGuardrail ? 'Protecciones que necesitan revisión' : 'Todo avanza dentro de límites'}
                    </h2>
                  </div>
                  <Badge color={hasExceededGuardrail ? 'rose' : hasAttentionGuardrail ? 'amber' : 'emerald'}>
                    {hasAttentionGuardrail ? `${attentionGuardrails.length} señal${attentionGuardrails.length === 1 ? '' : 'es'}` : 'Sin bloqueos'}
                  </Badge>
                </header>
                {guardrails.length === 0 ? (
                  <div className="flex min-h-42 flex-col items-start justify-center px-5 py-6 sm:px-6">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-600">
                      <ShieldCheckIcon className="size-4" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-ink">Sin límites adicionales a nivel portafolio.</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">El consumo permanece trazable por proyecto. Añade un guardrail sólo cuando necesites una protección específica.</p>
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
                              <Link
                                href={`/automation/projects/${row.project_id}`}
                                className="premium-surface-interactive flex items-center justify-between px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)/35 sm:px-6"
                              >
                                {content}
                              </Link>
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
                            <li key={row.project_id ?? `general-${row.project_name}`} className="px-5 py-3 sm:px-6">
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-ink">{row.project_name}</span>
                                  <span className="mt-1 block text-xs text-ink-muted">{shortUsage(row)}</span>
                                </span>
                                <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                                  {money(row.total_cost_microusd)}
                                </span>
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
                        <li key={`${row.provider}:${row.model}`} className="px-5 py-3.5 sm:px-6">
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
                          </div>
                          <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-interactive">
                            <span
                              className="block h-full rounded-full bg-sky-400"
                              style={{ width: `${Math.max(share, row.total_cost_microusd > 0 ? 5 : 0)}%` }}
                            />
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </section>

            <details className="group mt-4 overflow-hidden rounded-[1.5rem] border border-border-subtle bg-surface-raised" aria-labelledby="recent-title">
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
              {recentExecutions.length === 0 ? (
                <div className="flex min-h-32 items-center px-5 text-sm text-ink-muted sm:px-6">
                  Las llamadas del agente aparecerán aquí.
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
              {recentPage.total_pages > 1 && (
                <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-xs text-ink-muted">
                    Página {recentPage.page} de {recentPage.total_pages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={recentPage.page <= 1}
                      onClick={() => {
                        setPage((current) => Math.max(1, current - 1))
                        setSelectedExecution(null)
                      }}
                      className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-45"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={recentPage.page >= recentPage.total_pages}
                      onClick={() => {
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
