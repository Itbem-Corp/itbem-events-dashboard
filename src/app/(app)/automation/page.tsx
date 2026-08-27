'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { PageTransition } from '@/components/ui/page-transition'
import { deliveryPortfolioRefreshInterval, normalizeDeliveryPortfolio, type DeliveryPortfolioSnapshot } from '@/features/automation/delivery-portfolio'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { deliveryExecutionGraphBelongsTo, executionGraphEventsFromDelivery, type DeliveryExecutionGraphSnapshot } from '@/features/automation/delivery-execution-graph'
import { hasCancellationRequest, hasUnresolvedTaskFailure } from '@/features/automation/delivery-task-status'
import type { ExecutionGraphEvent, ExecutionGraphStatus } from '@/features/automation/execution-graph'
import { deliveryWorkItemStreamEnabled, useDeliveryWorkItemStream } from '@/features/automation/use-delivery-work-item-stream'
import { api, localSessionRecoveryMessage } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  automationHealthPath,
  automationInputUploadPath,
  automationPortfolioPath,
  automationTaskOutputPath,
  automationTasksPath,
  deliveryProjectsPath,
  deliveryWorkItemExecutionGraphPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload } from 'swr'

const ExecutionGraph = dynamic(
  () => import('@/features/automation/execution-graph').then((module) => module.ExecutionGraph),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Cargando flujo en vivo" className="h-64 overflow-hidden rounded-3xl border border-border-subtle bg-surface-soft/50 p-4 motion-reduce:animate-none">
        <div className="h-3 w-28 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
        <div className="mt-4 grid h-[calc(100%-1.75rem)] grid-cols-3 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="self-center animate-pulse rounded-2xl border border-border-subtle bg-surface-raised/70 p-3 motion-reduce:animate-none"><div className="h-2.5 w-3/4 rounded-full bg-surface-interactive" /><div className="mt-3 h-2 w-1/2 rounded-full bg-surface-interactive" /></div>)}
        </div>
        <span className="sr-only">Preparando el mapa de ejecución.</span>
      </div>
    ),
  }
)

type AutomationTask = {
  id: string
  job_id: string
  operation: string
  delivery_work_item_id?: string
  input_ref: string
  output_ref?: string
  status: 'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'completed' | 'failed' | 'dispatch_failed'
  provider?: string
  model?: string
  usage?: { total_tokens?: number }
  error_message?: string
  created_at: string
}

type AutomationHealth = {
  queued: number
  running: number
  failed_last_day: number
  expired_leases: number
  spend_last_day_microusd: number
  active_workers: number
  worker_capacity: number
  last_worker_seen_at?: string
  workers?: Array<{ provider: string; model: string; last_seen_at: string }>
}

type PortfolioItem = {
  id: string
  workItemId?: string
  title: string
  client: string
  href: string
  state: string
  updatedAt: string
  tasks: AutomationTask[]
  tasksTruncated?: boolean
}

const quickOperations = [
  { value: 'ai.chat', label: 'Consulta', icon: SparklesIcon },
  { value: 'document.analyze', label: 'Documento', icon: DocumentMagnifyingGlassIcon },
  { value: 'code.review', label: 'Código', icon: DocumentMagnifyingGlassIcon },
] as const

const phaseDefinitions = [
  { operation: 'delivery.plan', label: 'Plan' },
  { operation: 'delivery.implementation', label: 'Construir' },
  { operation: 'delivery.qa', label: 'QA' },
  { operation: 'delivery.summary', label: 'Entrega' },
  { operation: 'delivery.publish', label: 'Publicar' },
]

function taskStatus(status: AutomationTask['status']): ExecutionGraphStatus {
  if (status === 'running') return 'active'
  if (status === 'queued') return 'queued'
  if (status === 'completed') return 'complete'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'cancel_requested') return 'cancelling'
  return 'attention'
}

function itemStatus(item: PortfolioItem) {
  const tasks = item.tasks
  const activeTask = tasks.some((task) => task.status === 'running' || task.status === 'queued')
  const cancellingTask = hasCancellationRequest(tasks)
  if (item.state === 'cancelled') return { label: 'Cancelado', tone: 'zinc' as const }
  // A safe closure is the most recent operator intent. It must win over the
  // previous failure, review or active attempt everywhere in the Center.
  if (cancellingTask) return { label: 'Deteniéndose', tone: 'zinc' as const }
  if (item.state === 'blocked') return { label: 'Bloqueado', tone: 'rose' as const }
  if (hasUnresolvedTaskFailure(tasks)) return { label: 'Necesita atención', tone: 'rose' as const }
  if (item.state.includes('review')) return { label: 'Esperando decisión', tone: 'amber' as const }
  if (activeTask) return { label: 'En curso', tone: 'sky' as const }
  if (tasks.some((task) => task.status === 'cancelled')) return { label: 'Ejecución cancelada', tone: 'zinc' as const }
  if (item.state === 'released') return { label: 'Completado', tone: 'emerald' as const }
  // A completed attempt means the autonomous workflow has already moved.
  // “Preparando” implied an untouched item even when the graph was showing
  // real history, which made the portfolio feel stale.
  if (tasks.some((task) => task.status === 'completed')) return { label: 'Avanzando', tone: 'indigo' as const }
  return { label: 'Preparando', tone: 'indigo' as const }
}

function nextPhase(item: PortfolioItem) {
  if (item.state === 'cancelled') return 'Flujo cancelado'
  if (hasCancellationRequest(item.tasks)) return 'Detención segura'
  if (item.state === 'blocked') return 'Resolver bloqueo'
  if (hasUnresolvedTaskFailure(item.tasks)) return 'Revisar incidencia'
  const running = item.tasks.find((task) => task.status === 'running' || task.status === 'queued')
  if (running) return phaseDefinitions.find((phase) => phase.operation === running.operation)?.label ?? 'Agente'
  if (item.tasks.some((task) => task.status === 'cancelled')) return 'Revisar resultado'
  // Planning retains a generated proposal before it becomes a versioned
  // plan. The work-item console calls this “Propuesta preparada”; use the
  // same operator-facing phase here instead of jumping directly to Build.
  if (item.state === 'planning' && item.tasks.some((task) => task.operation === 'delivery.plan' && task.status === 'completed')) return 'Propuesta preparada'
  if (item.state.includes('review')) return 'Decisión humana'
  if (item.state === 'released') return 'Seguimiento'
  const completedPhaseIndex = Math.max(-1, ...phaseDefinitions.map((phase, index) => item.tasks.some((task) => task.operation === phase.operation && task.status === 'completed') ? index : -1))
  if (completedPhaseIndex >= 0) return phaseDefinitions[completedPhaseIndex + 1]?.label ?? 'Seguimiento'
  return 'Plan'
}

function nextActionCopy(item: PortfolioItem) {
  if (item.state === 'cancelled') return 'El flujo no se reanudará.'
  if (hasCancellationRequest(item.tasks)) return 'La ejecución se está cerrando de forma segura.'
  if (item.state === 'blocked') return 'Requiere resolver el bloqueo.'
  if (hasUnresolvedTaskFailure(item.tasks)) return 'El agente necesita una decisión antes de reintentar.'
  if (item.tasks.some((task) => task.status === 'running' || task.status === 'queued')) return 'El agente sigue avanzando en las etapas disponibles.'
  if (item.tasks.some((task) => task.status === 'cancelled')) return 'Una ejecución se detuvo; el flujo conserva su historial.'
  if (item.state === 'planning' && item.tasks.some((task) => task.operation === 'delivery.plan' && task.status === 'completed')) return 'El gate verificará la propuesta antes de continuar.'
  if (item.state.includes('review')) return 'Tu decisión libera el siguiente paso.'
  if (item.tasks.some((task) => task.status === 'completed')) return 'La siguiente etapa se prepara automáticamente.'
  return 'El agente continúa por su cuenta.'
}

function portfolioPriority(item: PortfolioItem) {
  if (hasCancellationRequest(item.tasks)) return 2
  if (item.state === 'blocked' || hasUnresolvedTaskFailure(item.tasks)) return 0
  if (item.state.includes('review')) return 1
  if (item.tasks.some((task) => task.status === 'running' || task.status === 'queued')) return 3
  if (item.state === 'cancelled' || item.state === 'released') return 5
  return 4
}

function decisionActionLabel(item: PortfolioItem) {
  if (item.state === 'blocked') return 'Resolver bloqueo'
  if (hasUnresolvedTaskFailure(item.tasks)) return 'Revisar incidencia'
  return 'Tomar decisión'
}

function latestTaskForOperation(item: PortfolioItem, operation: string) {
  return item.tasks
    .filter((task) => task.operation === operation)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
}

function phaseState(item: PortfolioItem, index: number): ExecutionGraphStatus {
  const phase = phaseDefinitions[index]
  const task = latestTaskForOperation(item, phase.operation)
  if (task) return taskStatus(task.status)
  const reviewAfterPhase = {
    plan_review: 0,
    code_review: 1,
    qa_review: 2,
    release_review: 3,
  }[item.state]
  if (reviewAfterPhase === index) return 'human'
  const knownPhase = Math.max(-1, ...phaseDefinitions.map((candidate, candidateIndex) => item.tasks.some((taskCandidate) => taskCandidate.operation === candidate.operation) ? candidateIndex : -1))
  if (index < knownPhase || (reviewAfterPhase !== undefined && index < reviewAfterPhase)) return 'complete'
  return 'waiting'
}

function progressPhases(item: PortfolioItem) {
  const observedPhaseIndexes = phaseDefinitions
    .map((phase, index) => item.tasks.some((task) => task.operation === phase.operation) ? index : -1)
    .filter((index) => index >= 0)
  const currentPhaseIndex = Math.max(-1, ...observedPhaseIndexes)
  const needsAttention = itemStatus(item).tone === 'rose'
  return phaseDefinitions
    .map((phase, index) => {
      const attempts = item.tasks.filter((task) => task.operation === phase.operation)
      const latest = latestTaskForOperation(item, phase.operation)
      const state = needsAttention && index === currentPhaseIndex ? 'attention' : phaseState(item, index)
      return { ...phase, state, attempts: attempts.length, latest }
    })
    .filter((phase) => phase.latest || phase.state === 'human')
    .slice(0, 4)
}

function progressLabel(state: ExecutionGraphStatus) {
  if (state === 'active') return 'Ahora'
  if (state === 'complete') return 'Listo'
  if (state === 'queued') return 'En cola'
  if (state === 'human') return 'Decisión'
  if (state === 'attention') return 'Atención'
  if (state === 'cancelling') return 'Deteniéndose'
  if (state === 'cancelled') return 'Cancelada'
  return 'En espera'
}

function phaseMarkerClass(state: ExecutionGraphStatus) {
  if (state === 'complete') return 'border-emerald-500 bg-emerald-500 text-white'
  if (state === 'active') return 'border-(--tenant-accent) bg-(--tenant-accent) text-white'
  if (state === 'human') return 'border-amber-500 bg-amber-500/10 text-amber-700'
  if (state === 'cancelling' || state === 'cancelled') return 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  if (state === 'attention' || state === 'blocked') return 'border-rose-500 bg-rose-500/10 text-rose-700'
  return 'border-border-subtle bg-surface-soft text-ink-muted'
}

function activityFallbackGraph(item: PortfolioItem): ExecutionGraphEvent[] {
  const tasks = [...item.tasks].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
  if (tasks.length === 0) {
    return [{
      id: `${item.id}:waiting`,
      occurredAt: item.updatedAt,
      trackId: `waiting:${item.id}`,
      trackLabel: 'Preparación',
      title: 'Esperando el primer movimiento',
      summary: 'Esperando el primer movimiento',
      detail: 'Todavía no hay una ejecución registrada para este resultado.',
      status: 'waiting',
    }]
  }
  return tasks.map((task) => ({
    id: task.id,
    occurredAt: task.created_at,
    // A retry belongs to the delivery phase, not to the whole result. This
    // keeps attempts connected while the latest attempt drives its state.
    trackId: `operation:${task.operation}`,
    trackLabel: phaseDefinitions.find((phase) => phase.operation === task.operation)?.label ?? 'Agente',
    title: phaseDefinitions.find((phase) => phase.operation === task.operation)?.label ?? task.operation,
    summary: phaseDefinitions.find((phase) => phase.operation === task.operation)?.label ?? task.operation,
    detail: task.status === 'running' ? 'El agente trabaja en esta etapa.' : task.status === 'completed' ? 'Etapa terminada.' : task.status === 'queued' ? 'Etapa preparada para iniciar.' : task.status === 'cancel_requested' ? 'Solicitud recibida; este paso se cerrará de forma segura.' : task.status === 'cancelled' ? 'La ejecución se detuvo; no se iniciarán pasos nuevos.' : 'La ejecución requiere atención.',
    status: taskStatus(task.status),
    // Match the server graph's phase grouping while its snapshot is loading.
    // This leaves retries inspectable in the group, but presents their latest
    // status as the one the operator should act on.
    kind: 'execution',
    groupId: `phase:${task.operation}`,
    groupLabel: phaseDefinitions.find((phase) => phase.operation === task.operation)?.label ?? 'Agente',
    metadata: { operation: task.operation },
  }))
}

/**
 * The portfolio is intentionally compact and can omit older attempts. When a
 * selected result has a verified execution-graph snapshot, that snapshot is
 * the more precise source for its current track state. Only the newest event
 * in each track counts, so a resolved retry never becomes a false incident.
 */
function graphHasCurrentAttention(events: readonly ExecutionGraphEvent[]) {
  const currentByTrack = new Map<string, ExecutionGraphEvent>()
  for (const event of events) {
    const operation = event.metadata?.operation
    const phaseKey = typeof operation === 'string' && operation ? `operation:${operation}` : event.trackId
    const current = currentByTrack.get(phaseKey)
    const occurredAt = Date.parse(event.occurredAt)
    const currentOccurredAt = current ? Date.parse(current.occurredAt) : Number.NEGATIVE_INFINITY
    if (!current || occurredAt > currentOccurredAt || (occurredAt === currentOccurredAt && event.id.localeCompare(current.id) > 0)) {
      currentByTrack.set(phaseKey, event)
    }
  }
  return [...currentByTrack.values()].some((event) => event.status === 'attention' || event.status === 'blocked')
}

function workItemFromProject(project: DeliveryProject): PortfolioItem[] {
  const workItems = project.work_items ?? []
  if (workItems.length) {
    return workItems.map((workItem) => ({
      id: workItem.id,
      workItemId: workItem.id,
      title: workItem.title,
      client: project.client?.name ?? 'Sin cliente',
      href: `/automation/work-items/${workItem.id}`,
      state: workItem.state,
      updatedAt: workItem.updated_at,
      tasks: (workItem.automation_tasks ?? []).map((task) => ({ ...task, job_id: task.id, input_ref: '' })),
    }))
  }
  return [{
    id: `project:${project.id}`,
    title: project.name,
    client: project.client?.name ?? 'Sin cliente',
    href: `/automation/projects/${project.id}`,
    state: project.status,
    updatedAt: project.updated_at,
    tasks: [],
  }]
}

function workItemFromPortfolio(snapshot: DeliveryPortfolioSnapshot): PortfolioItem[] {
  return snapshot.projects.flatMap((project) => project.workItems.map((workItem) => ({
    id: workItem.id,
    workItemId: workItem.id,
    title: workItem.title,
    client: project.client.name || project.name,
    href: `/automation/work-items/${workItem.id}`,
    state: workItem.state,
    updatedAt: workItem.updatedAt,
    tasksTruncated: workItem.automationTasksTruncated,
    tasks: workItem.automationTasks.map((task) => ({
      id: task.id,
      job_id: task.id,
      operation: task.operation,
      input_ref: '',
      status: task.status,
      created_at: task.createdAt,
      ...(task.completedAt ? { completed_at: task.completedAt } : {}),
    })),
  })))
}

function formatShortDate(value?: string) {
  if (!value) return 'sin movimiento aún'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'sin movimiento aún' : parsed.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function AutomationPage() {
  const portfolioQuery = useSWR(automationPortfolioPath(), async (path) => normalizeDeliveryPortfolio(await fetcher<unknown>(path)), { refreshInterval: deliveryPortfolioRefreshInterval, revalidateOnFocus: true, keepPreviousData: true })
  // The compact portfolio is the primary read model. Keep the old project
  // collection strictly as a recovery path so opening the Center does not
  // fetch the same work-item graph twice.
  const needsProjectRecovery = Boolean(portfolioQuery.error || (!portfolioQuery.data && !portfolioQuery.isLoading))
  const needsTaskRecovery = needsProjectRecovery
  const legacyTasksQuery = useSWR<AutomationTask[]>(
    needsTaskRecovery ? automationTasksPath() : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, keepPreviousData: true },
  )
  const projectsQuery = useSWR<DeliveryProject[]>(
    needsProjectRecovery ? deliveryProjectsPath() : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const health = useSWR<AutomationHealth>(automationHealthPath(), fetcher, { refreshInterval: 30_000 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(true)
  const [quickOpen, setQuickOpen] = useState(false)
  const [operation, setOperation] = useState<(typeof quickOperations)[number]['value']>('ai.chat')
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [openingTaskID, setOpeningTaskID] = useState('')
  const [selectedFocusRequest, setSelectedFocusRequest] = useState(0)
  const selectedFlowRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

  const items = useMemo(() => {
    const looseTasks = legacyTasksQuery.data ?? []
    const projectItems = portfolioQuery.data
      ? workItemFromPortfolio(portfolioQuery.data)
      : (projectsQuery.data ?? []).flatMap(workItemFromProject)
    const attached = new Set(projectItems.flatMap((item) => item.tasks.map((task) => task.id)))
    const standalone: PortfolioItem[] = looseTasks
      .filter((task) => !task.delivery_work_item_id && !attached.has(task.id))
      .map((task) => ({
        id: `task:${task.id}`,
        title: task.operation.replace('.', ' · '),
        client: 'Automatización puntual',
        href: '',
        state: task.status,
        updatedAt: task.created_at,
        tasks: [task],
      }))
    return [...projectItems, ...standalone].sort((left, right) => {
      const priority = portfolioPriority(left) - portfolioPriority(right)
      return priority || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
  }, [legacyTasksQuery.data, portfolioQuery.data, projectsQuery.data])
  const preferredSelected =
    items.find((item) => itemStatus(item).tone === 'rose') ??
    items.find((item) => itemStatus(item).tone === 'amber') ??
    items[0]
  const selected = items.find((item) => item.id === selectedId) ?? preferredSelected
  useEffect(() => {
    // Pick a first meaningful flow once, then keep that selection stable while
    // live data reorders the portfolio. The agent may surface a new incident,
    // but it should appear in the decision tray rather than stealing the
    // operator away from the graph or result they are currently exploring.
    if (!selectedId && preferredSelected) {
      setSelectedId(preferredSelected.id)
      return
    }
    // A terminal deletion or access change can legitimately retire the open
    // result. Only in that case choose the next relevant item.
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(preferredSelected?.id ?? null)
      setIsDetailOpen(Boolean(preferredSelected))
    }
  }, [items, preferredSelected, selectedId])
  const selectedGraphEnabled = Boolean(isDetailOpen && selected?.workItemId)
  const selectedGraphQuery = useSWR<DeliveryExecutionGraphSnapshot>(
    selectedGraphEnabled && selected?.workItemId ? deliveryWorkItemExecutionGraphPath(selected.workItemId) : null,
    fetcher,
    // SSE invalidates this snapshot immediately when the selected work item
    // changes. Keep a slow polling fallback for suspended or unavailable
    // streams without duplicating the normal live-update traffic.
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 2_000, keepPreviousData: true },
  )
  const selectedStream = useDeliveryWorkItemStream(selected?.workItemId, {
    enabled: selectedGraphEnabled && deliveryWorkItemStreamEnabled(selected?.workItemId, selected?.state),
    // A reconnect begins with a new authoritative snapshot. Revalidate both
    // read models so the active graph cannot remain stale after a renewed
    // subscription begins at a newer revision.
    onSnapshot: () => { void portfolioQuery.mutate(); void selectedGraphQuery.mutate() },
    onUpdate: () => { void portfolioQuery.mutate(); void selectedGraphQuery.mutate() },
  })
  const selectedGraphMatches = deliveryExecutionGraphBelongsTo(selectedGraphQuery.data, selected?.workItemId)
  const selectedGraphEvents = selectedGraphMatches && selectedGraphQuery.data ? executionGraphEventsFromDelivery(selectedGraphQuery.data) : selected ? activityFallbackGraph(selected) : []
  const selectedGraphHasAttention = Boolean(selectedGraphMatches && graphHasCurrentAttention(selectedGraphEvents))
  // A flow that is safely closing may still contain the failed/reviewed task
  // that led to the request. It is no longer a current intervention, so keep
  // it out of the tray and let the closure remain visible in Live Steps.
  const incidents = items.filter(
    (item) =>
      !hasCancellationRequest(item.tasks) &&
      (item.state === 'blocked' || hasUnresolvedTaskFailure(item.tasks))
  )
  const decisions = items.filter(
    (item) =>
      !hasCancellationRequest(item.tasks) &&
      !incidents.some((incident) => incident.id === item.id) &&
      item.state.includes('review')
  )
  const selectedGraphIncident = selectedGraphHasAttention && selected && !incidents.some((incident) => incident.id === selected.id) ? selected : undefined
  const visibleIncidents = selectedGraphIncident ? [selectedGraphIncident, ...incidents] : incidents
  const needsDecision = [...visibleIncidents, ...decisions.filter((item) => !visibleIncidents.some((incident) => incident.id === item.id))]
  const portfolioAttention = portfolioQuery.data
    ? portfolioQuery.data.totals.decisionsRequired + portfolioQuery.data.totals.blockedWorkItems + portfolioQuery.data.totals.attentionTasks
    : needsDecision.length
  // The compact portfolio total has formal gates, while the Center also
  // surfaces failed/blocked runs as human interventions. Do not show a zero
  // in the header when the decision tray contains a real incident to review.
  const reportedDecisions = Math.max(
    portfolioQuery.data?.totals.decisionsRequired ?? 0,
    needsDecision.length,
  )
  const hasUnlistedAttention = Boolean(portfolioQuery.data && portfolioAttention > needsDecision.length)
  const hasTruncatedPortfolio = Boolean(portfolioQuery.data?.projects.some((project) => project.workItemsTruncated || project.workItems.some((workItem) => workItem.automationTasksTruncated)))
  const activeItems = items.filter((item) => !hasCancellationRequest(item.tasks))
  const activeCount = activeItems.filter((item) => item.tasks.some((task) => task.status === 'running' || task.status === 'queued')).length
  const runningCount = activeItems.filter((item) => item.tasks.some((task) => task.status === 'running')).length
  const queuedCount = activeItems.filter((item) => item.tasks.some((task) => task.status === 'queued')).length
  const activeWorkers = health.data?.active_workers ?? 0
  const agentPulseActive = activeWorkers > 0 || runningCount > 0
  const isPortfolioLoading = !items.length && (legacyTasksQuery.isLoading || portfolioQuery.isLoading || projectsQuery.isLoading)
  const portfolioSessionRecoveryMessage =
    localSessionRecoveryMessage(portfolioQuery.error) ??
    localSessionRecoveryMessage(legacyTasksQuery.error) ??
    localSessionRecoveryMessage(projectsQuery.error)
  const hasPortfolioLoadFailure =
    (Boolean(legacyTasksQuery.error) && !portfolioQuery.data && !projectsQuery.data) ||
    (Boolean(portfolioQuery.error) && Boolean(projectsQuery.error))
  const agentPulse = hasPortfolioLoadFailure
    ? { label: 'Sincronización pendiente', tone: 'bg-amber-400', state: 'sincronización pendiente' }
    : agentPulseActive
      ? { label: activeWorkers ? 'Agentes operativos' : 'Agente en marcha', tone: 'bg-emerald-400 delivery-signal', state: 'operativo' }
      : queuedCount
        ? { label: 'Preparando flujo', tone: 'bg-amber-400', state: 'preparando flujo' }
        : { label: 'Agentes en espera', tone: 'bg-zinc-400', state: 'en espera' }

  async function submitQuick(event: FormEvent) {
    event.preventDefault()
    if (!prompt.trim()) return
    setSubmitting(true)
    setMessage('')
    try {
      const input = { prompt: prompt.trim(), system: '' }
      const upload = readApiData<{ input_ref: string; upload_url: string; local_proxy_upload_safe?: boolean }>((await api.post(automationInputUploadPath())).data)
      let inputRef = upload.input_ref
      try {
        const uploaded = await fetch(upload.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
        if (!uploaded.ok) throw new Error('private input upload failed')
      } catch (uploadError) {
        if (!upload.local_proxy_upload_safe) throw uploadError
        inputRef = readApiData<{ input_ref: string }>((await api.post(automationInputUploadPath(), { content: input })).data).input_ref
      }
      await api.post(automationTasksPath(), { operation, input_ref: inputRef })
      setPrompt('')
      setMessage('Tu consulta ya está en movimiento.')
      setQuickOpen(false)
      await Promise.all([legacyTasksQuery.mutate(), portfolioQuery.mutate()])
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible iniciar la consulta.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function openOutput(taskID: string) {
    setOpeningTaskID(taskID)
    try {
      const response = await api.get(automationTaskOutputPath(taskID))
      window.open(readApiData<{ download_url: string }>(response.data).download_url, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningTaskID('')
    }
  }

  function selectResult(id: string, focus = false) {
    setSelectedId(id)
    setIsDetailOpen(true)
    if (focus) setSelectedFocusRequest((request) => request + 1)
  }

  function preloadResultFlow(item: PortfolioItem) {
    if (!item.workItemId) return
    void Promise.resolve(preload(deliveryWorkItemExecutionGraphPath(item.workItemId), fetcher)).catch(() => undefined)
  }

  useEffect(() => {
    if (!selectedFocusRequest || !selectedId || !isDetailOpen) return
    const frame = requestAnimationFrame(() => {
      const flow = selectedFlowRef.current
      if (!flow) return
      flow.focus({ preventScroll: true })
      flow.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [isDetailOpen, reduceMotion, selectedFocusRequest, selectedId])

  return (
    <PageTransition>
      <main className="mx-auto max-w-[96rem] px-4 py-5 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
        <header className="flex flex-col gap-4 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-[.16em] text-(--tenant-accent) uppercase"><SparklesIcon className="size-4" /> Automation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Centro de automatización</h1>
            <p className="mt-1.5 text-sm text-ink-secondary">El agente avanza; tú intervienes sólo cuando importa.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!hasPortfolioLoadFailure && <span aria-label={`Pulso de agentes: ${agentPulse.state}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary"><span aria-hidden="true" className={`size-2 rounded-full ${agentPulse.tone}`} /> {agentPulse.label}</span>}
            {!hasPortfolioLoadFailure && <Button color="indigo" href="/automation/projects?create=1"><SparklesIcon data-slot="icon" />Iniciar resultado</Button>}
          </div>
        </header>

        <div className={`mt-5 ${hasPortfolioLoadFailure ? 'mx-auto max-w-3xl' : `grid grid-cols-1 gap-5 ${items.length === 0 ? 'xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-5' : '2xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:gap-5'}`} `}>
          <section aria-labelledby="portfolio-title" className="min-w-0">
            {!hasPortfolioLoadFailure && <div aria-label="Estado del portafolio" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-subtle bg-surface-raised px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-ink-secondary sm:gap-x-5">
                {reportedDecisions > 0 ? (
                  <span className={`inline-flex items-center gap-2 ${visibleIncidents.length > 0 ? 'text-rose-700' : 'text-amber-800'}`}>
                    <span aria-hidden="true" className={`size-2 rounded-full ${visibleIncidents.length > 0 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    {visibleIncidents.length > 0 ? 'Intervención necesaria' : 'Decisión lista'}
                    <b className={`rounded-full px-1.5 py-0.5 ${visibleIncidents.length > 0 ? 'bg-rose-500/10 text-rose-700' : 'bg-amber-500/10 text-amber-800'}`}>{reportedDecisions}</b>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />El agente no necesita intervención</span>
                )}
                {activeCount > 0 && <span className="inline-flex items-center gap-2 text-ink-secondary"><span aria-hidden="true" className="size-2 rounded-full bg-sky-500 delivery-signal" />{activeCount} en movimiento</span>}
              </div>
              <button type="button" aria-label="Actualizar estado del portafolio" onClick={() => { void legacyTasksQuery.mutate(); void portfolioQuery.mutate(); if (needsProjectRecovery) void projectsQuery.mutate() }} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"><ArrowPathIcon className={`size-4 ${legacyTasksQuery.isValidating || portfolioQuery.isValidating || projectsQuery.isValidating ? 'animate-spin motion-reduce:animate-none' : ''}`} /><span className="hidden sm:inline">Actualizar</span></button>
            </div>}

              {!hasPortfolioLoadFailure && <div className="mt-5 flex items-center justify-between gap-3 px-1">
              <div><h2 id="portfolio-title" className="text-xl font-semibold tracking-tight text-ink">Flujos prioritarios</h2></div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted"><span className={`size-1.5 rounded-full ${hasPortfolioLoadFailure ? 'bg-amber-500' : legacyTasksQuery.isValidating || portfolioQuery.isValidating ? 'bg-sky-500 animate-pulse motion-reduce:animate-none' : runningCount > 0 ? 'bg-emerald-500 delivery-signal' : 'bg-emerald-500'}`} />{hasPortfolioLoadFailure ? 'Sin sincronizar' : legacyTasksQuery.isValidating || portfolioQuery.isValidating ? 'Actualizando' : hasTruncatedPortfolio ? 'Vista reciente' : runningCount > 0 ? 'En ejecución' : 'Actualizado'}</span>
            </div>}

            {hasPortfolioLoadFailure ? (
              <div role="alert" className="premium-surface mt-4 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-4 text-left sm:px-5 sm:py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ExclamationTriangleIcon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{portfolioSessionRecoveryMessage ? 'La sesión local necesita atención' : 'No pudimos sincronizar el portafolio'}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{portfolioSessionRecoveryMessage ?? 'Los flujos siguen en curso. Vuelve a sincronizar para recuperar su pulso.'}</p>
                </div>
                <Button outline className="w-full sm:w-auto" onClick={() => { void legacyTasksQuery.mutate(); void portfolioQuery.mutate(); if (needsProjectRecovery) void projectsQuery.mutate() }}>{portfolioSessionRecoveryMessage ? 'Actualizar sesión' : 'Reintentar'}</Button>
              </div>
            ) : isPortfolioLoading ? (
              <div role="status" aria-busy="true" aria-label="Cargando resultados" className="mt-4 space-y-3">
                {[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-3xl border border-border-subtle bg-surface-soft/70 motion-reduce:animate-none" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="premium-surface mt-4 rounded-3xl px-6 py-8 text-center sm:px-9"><SparklesIcon className="mx-auto size-7 text-(--tenant-accent)" /><p className="mt-3 text-base font-semibold text-ink">El agente está listo</p><p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-muted">Inicia un resultado y el flujo continuará de forma autónoma.</p><Button color="indigo" href="/automation/projects?create=1" className="mt-4">Iniciar resultado</Button></div>
            ) : (
              <>
              <ol className="relative mt-4 space-y-2.5 before:absolute before:inset-y-5 before:left-3.5 before:w-px before:bg-(--tenant-accent)/25 sm:before:left-5">
                {items.map((item) => {
                  const expanded = selected?.id === item.id && isDetailOpen
                  const graphConfirmsAttention = expanded && selectedGraphHasAttention
                  const status = graphConfirmsAttention ? { label: 'Necesita atención', tone: 'rose' as const } : itemStatus(item)
                  const detailId = `automation-result-${item.id}`
                  return <li key={item.id} className="relative pl-8 sm:pl-11">
                    <span className={`absolute left-1.5 top-7 z-10 size-4 rounded-full border-4 border-canvas sm:left-3 ${status.tone === 'emerald' ? 'bg-emerald-500' : status.tone === 'rose' ? 'bg-rose-500' : status.tone === 'amber' ? 'bg-amber-500' : status.tone === 'zinc' ? 'bg-zinc-400' : 'bg-sky-500 delivery-signal'}`} />
                    <article className={`overflow-hidden rounded-3xl border transition ${expanded ? 'border-(--tenant-accent)/40 bg-surface-raised shadow-sm' : 'premium-surface-interactive border-border-subtle bg-surface-raised'}`}>
                      <button
                        type="button"
                        aria-label={`${expanded ? 'Cerrar' : 'Abrir'} flujo de ${item.title}`}
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailId : undefined}
                        onClick={() => {
                          if (selected?.id === item.id) setIsDetailOpen((open) => !open)
                          else selectResult(item.id, true)
                        }}
                        onPointerEnter={() => preloadResultFlow(item)}
                        onPointerDown={() => preloadResultFlow(item)}
                        onFocus={() => preloadResultFlow(item)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-5 sm:py-3.5"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><FolderOpenIcon className="size-5" /></span>
                        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{item.title}</span><Badge color={status.tone}>{status.label}</Badge></span><span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted"><span className="truncate">{item.client}</span><span aria-hidden="true">·</span><span className="shrink-0">{formatShortDate(item.updatedAt)}</span></span><span className="mt-2 flex items-center gap-1.5 md:hidden" aria-label={`Fases de ${item.title}: siguiente ${nextPhase(item)}`}>{phaseDefinitions.slice(0, 4).map((phase, index) => { const state = phaseState(item, index); return <span key={phase.operation} className="flex items-center gap-1"><span className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[8px] ${phaseMarkerClass(state)}`}>{state === 'complete' ? '✓' : index + 1}</span>{index < 3 ? <span className="h-px w-3 bg-border-subtle" /> : null}</span> })}<span className="ml-1 truncate text-[10px] font-semibold text-ink-secondary">{nextPhase(item)}</span></span></span>
                        <span className="hidden min-w-50 items-center gap-1.5 md:flex" aria-label={`Fases de ${item.title}`}>{phaseDefinitions.slice(0, 4).map((phase, index) => { const state = phaseState(item, index); return <span key={phase.operation} className="flex min-w-0 flex-1 items-center gap-1"><span className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[8px] ${phaseMarkerClass(state)}`}>{state === 'complete' ? '✓' : index + 1}</span>{index < 3 ? <span className="h-px flex-1 bg-border-subtle" /> : null}</span> })}</span>
                        <span className="hidden w-28 text-right text-xs font-semibold text-ink-secondary lg:block"><span className="block text-[10px] font-bold tracking-[.12em] text-ink-muted uppercase">Siguiente</span>{nextPhase(item)}</span>
                        <span className="hidden shrink-0 text-xs font-semibold text-(--tenant-accent) lg:inline">{expanded ? 'Cerrar' : 'Ver flujo'}</span>
                        <ChevronDownIcon className={`size-5 shrink-0 text-ink-muted transition motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>{expanded ? <motion.div id={detailId} role="region" aria-label={`Detalle de ${item.title}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }} className="border-t border-border-subtle">
                        <div className="grid items-start gap-3.5 p-3.5 sm:p-4 md:grid-cols-[minmax(8.5rem,.72fr)_minmax(0,1.8fr)] 2xl:grid-cols-[minmax(8.5rem,.8fr)_minmax(20rem,2fr)_minmax(9.5rem,.9fr)]">
                          <div aria-label="Ruta del resultado" className="order-1 rounded-2xl border border-border-subtle bg-surface-soft/45 p-3.5"><p className="text-[10px] font-bold tracking-[.14em] text-ink-muted uppercase">Ruta</p><div className="mt-3 space-y-2.5">{progressPhases(item).map((phase) => <div key={phase.operation} className="flex gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${phase.state === 'complete' ? 'bg-emerald-500' : phase.state === 'active' ? 'bg-sky-500 delivery-signal' : phase.state === 'queued' || phase.state === 'human' ? 'bg-amber-500' : phase.state === 'attention' ? 'bg-rose-500' : phase.state === 'cancelling' || phase.state === 'cancelled' ? 'bg-ink-muted/60' : 'bg-zinc-400'}`} /><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink">{phase.label}</span><span className="block truncate text-[11px] text-ink-muted">{progressLabel(phase.state)}</span></span></div>)}{item.tasks.length > 0 ? <p className="pt-0.5 text-[11px] font-semibold text-ink-muted">{item.tasks.length} ejecuci{item.tasks.length === 1 ? 'ón registrada' : 'ones registradas'}</p> : <p className="text-xs leading-5 text-ink-muted">Preparando el primer movimiento.</p>}</div></div>
                          <div ref={expanded ? selectedFlowRef : undefined} tabIndex={-1} aria-label={`Live steps de ${item.title}`} className="order-2 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised md:order-2"><ExecutionGraph density="compact" events={selectedGraphEvents} eyebrow="Live steps" title="Flujo" maxEvents={8} autoFollow statusIndicator={item.workItemId ? { state: selectedStream.status, label: selectedStream.status === 'live' ? 'Canal en vivo' : undefined, tone: 'default', onRefresh: () => { void portfolioQuery.mutate(); void selectedGraphQuery.mutate() } } : undefined} grouping={{ enabled: true, mode: 'smart' }} views={[{ id: 'flow', label: 'Flujo', shortLabel: 'Flujo' }]} /></div>
                          <div className="order-3 rounded-2xl border border-border-subtle bg-surface-raised p-3.5 md:order-3 md:col-span-2 2xl:col-span-1"><p className="text-[10px] font-bold tracking-[.14em] text-ink-muted uppercase">Siguiente</p><p className="mt-2 text-sm font-semibold text-ink">{nextPhase(item)}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{nextActionCopy(item)}</p>{item.href ? <Link href={item.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">Abrir resultado <ArrowRightIcon className="size-3.5" /></Link> : item.tasks[0]?.output_ref ? <Button outline className="mt-3" disabled={openingTaskID === item.tasks[0].id} onClick={() => void openOutput(item.tasks[0].id)}>{openingTaskID === item.tasks[0].id ? 'Abriendo…' : 'Ver resultado'}</Button> : null}</div>
                        </div>
                      </motion.div> : null}</AnimatePresence>
                    </article>
                  </li>
                })}
              </ol>
              {hasTruncatedPortfolio ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-soft/60 px-4 py-3 text-xs text-ink-secondary"><span>Vista reciente: algunos movimientos están resumidos.</span><Link href="/automation/projects" className="font-semibold text-(--tenant-accent)">Ver todos</Link></div> : null}
              </>
            )}
          </section>

          {!hasPortfolioLoadFailure && <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <section className="premium-surface overflow-hidden rounded-3xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3.5">
                <p className="text-xs font-bold tracking-[.14em] text-ink-muted uppercase">Bandeja de decisiones</p>
                <span aria-label={`${needsDecision.length} intervenciones visibles`} className={`flex min-w-6 items-center justify-center rounded-full px-1.5 py-1 text-xs font-bold ${needsDecision.length ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-700'}`}>{needsDecision.length}{hasUnlistedAttention ? '+' : ''}</span>
              </div>
              {needsDecision.length ? <><ul className="divide-y divide-border-subtle">{needsDecision.slice(0, 2).map((item) => { const incident = visibleIncidents.some((candidate) => candidate.id === item.id); return <li key={item.id} className="p-3.5"><div className="flex items-start gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${incident ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600'}`}><ShieldCheckIcon className="size-4" /></span><div className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{item.title}</span><span className="mt-1 block truncate text-xs text-ink-muted">{item.client} · {nextPhase(item)}</span><button type="button" onClick={() => selectResult(item.id, true)} onPointerEnter={() => preloadResultFlow(item)} onPointerDown={() => preloadResultFlow(item)} onFocus={() => preloadResultFlow(item)} className="mt-2.5 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-(--tenant-accent) transition hover:bg-(--tenant-accent)/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">{incident ? 'Revisar incidencia' : decisionActionLabel(item)} <ChevronRightIcon className="size-3.5" /></button></div></div></li> })}</ul>{needsDecision.length > 2 || hasUnlistedAttention ? <div className="border-t border-border-subtle px-4 py-3"><Link href="/automation/projects" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-(--tenant-accent)">Ver pendientes <ChevronRightIcon className="size-3.5" /></Link></div> : null}</> : hasUnlistedAttention ? <div className="px-4 py-6 text-center"><ExclamationTriangleIcon className="mx-auto size-6 text-amber-500" /><p className="mt-3 text-sm font-semibold text-ink">Hay atención pendiente</p><Link href="/automation/projects" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-(--tenant-accent)">Abrir resultados <ChevronRightIcon className="size-3.5" /></Link></div> : hasPortfolioLoadFailure ? <div className="flex items-center gap-3 px-4 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ExclamationTriangleIcon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-ink">Pendiente de sincronizar</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">Aún no podemos confirmar si hay decisiones o bloqueos.</p></div></div> : hasTruncatedPortfolio ? <div className="flex items-center gap-3 px-4 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600"><FolderOpenIcon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-ink">Vista reciente</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">Abre Resultados para confirmar decisiones fuera de este resumen.</p></div></div> : <div className="flex items-center gap-3 px-4 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><CheckCircleIcon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-ink">Autonomía activa</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">{agentPulseActive ? 'El agente sigue ejecutando sin necesitarte.' : activeCount > 0 ? `${activeCount} flujo${activeCount === 1 ? '' : 's'} continúa sin intervención.` : 'No hay decisiones ni bloqueos pendientes.'}</p></div></div>}
            </section>
            <button type="button" onClick={() => setQuickOpen(true)} className="premium-surface-interactive flex w-full items-center gap-3 rounded-3xl border border-border-subtle bg-surface-raised p-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"><span className="flex size-9 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><SparklesIcon className="size-5" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-ink">Consulta puntual</span><span className="mt-0.5 block truncate text-xs text-ink-muted">Sin crear un resultado</span></span><ChevronRightIcon className="ml-auto size-4 shrink-0 text-ink-muted" /></button>
          </aside>}
        </div>
      </main>

      <Dialog open={quickOpen} onClose={setQuickOpen} size="md"><DialogTitle>Consulta rápida</DialogTitle><DialogBody><p className="text-sm leading-6 text-ink-secondary">Para una necesidad puntual. Los resultados de Delivery siguen su flujo autónomo.</p><form onSubmit={submitQuick} className="mt-5"><div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de consulta">{quickOperations.map((candidate) => <button key={candidate.value} type="button" aria-pressed={operation === candidate.value} onClick={() => setOperation(candidate.value)} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) ${operation === candidate.value ? 'border-(--tenant-accent)/45 bg-(--tenant-accent)/10 text-(--tenant-accent)' : 'border-border-subtle text-ink-secondary hover:bg-surface-soft'}`}>{candidate.label}</button>)}</div><label className="mt-4 block text-sm font-semibold text-ink">Resultado que buscas<textarea required rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Escribe lo que necesitas resolver…" className="mt-2 w-full resize-y rounded-2xl border border-border-subtle bg-surface-soft px-3 py-3 text-sm leading-6 text-ink outline-none focus:border-(--tenant-accent)" /></label><DialogActions><Button plain type="button" onClick={() => setQuickOpen(false)}>Cancelar</Button><Button color="indigo" type="submit" disabled={submitting}><PaperAirplaneIcon data-slot="icon" />{submitting ? 'Enviando…' : 'Enviar'}</Button></DialogActions></form></DialogBody></Dialog>
      {message ? <div role="status" className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-2xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-ink shadow-xl">{message}</div> : null}
    </PageTransition>
  )
}
