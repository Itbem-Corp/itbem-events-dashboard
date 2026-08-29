'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import {
  deliveryPortfolioRefreshInterval,
  normalizeDeliveryPortfolio,
  type DeliveryPortfolioProject,
  type DeliveryPortfolioSnapshot,
  type DeliveryPortfolioWorkItem,
} from '@/features/automation/delivery-portfolio'
import { hasCancellationRequest, unresolvedFailedTasks } from '@/features/automation/delivery-task-status'
import type { DeliveryProject, DeliveryTaskStatus, DeliveryWorkItem } from '@/features/automation/delivery-types'
import { api, localSessionRecoveryMessage } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { automationPortfolioPath, clientsPagePath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { ClientsPageResponse } from '@/models/Client'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PlusIcon,
  RocketLaunchIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

type PortfolioFilter = 'all' | 'live' | 'attention' | 'paused' | 'complete'
type PulseTone = 'live' | 'stopping' | 'attention' | 'incident' | 'complete' | 'paused' | 'ready'

type WorkspaceSnapshot = {
  hasOutcomeData: boolean
  hasCompleteOutcomeSet: boolean
  totalOutcomes: number
  deliveredOutcomes: number
  activeOutcomes: number
  attentionOutcomes: number
  blockedOutcomes: number
  attentionTasks: number
  progress: number
  focus?: WorkspaceWorkItem
  pulse: {
    tone: PulseTone
    label: string
    detail: string
  }
}

type WorkspaceTask = {
  id: string
  operation: string
  status: DeliveryTaskStatus
  created_at: string
  completed_at?: string
}

type WorkspaceWorkItem = {
  id: string
  title: string
  state: string
  updated_at: string
  automation_tasks?: WorkspaceTask[]
  automation_tasks_truncated?: boolean
}

type WorkspaceProject = {
  id: string
  client_id: string
  name: string
  summary?: string
  status: string
  updated_at: string
  client?: { id: string; name: string; code?: string }
  context_count?: number
  work_items?: WorkspaceWorkItem[]
  work_item_count?: number
  active_work_items?: number
  decisions_required?: number
  blocked_work_items?: number
  attention_tasks?: number
  work_items_truncated?: boolean
}

const activeStates = new Set(['planning', 'implementation', 'preview_pending', 'qa_running'])
const decisionStates = new Set(['plan_review', 'code_review', 'qa_review', 'release_review'])
const emptyProjects: DeliveryProject[] = []

const stateLabel: Record<string, string> = {
  planning: 'Preparando el plan',
  plan_review: 'Plan listo para decidir',
  implementation: 'Construyendo',
  code_review: 'Cambio listo para revisión',
  preview_pending: 'Preparando la validación',
  qa_running: 'Validando',
  qa_review: 'QA listo para decidir',
  release_review: 'Entrega lista para decidir',
  released: 'Entregado',
  blocked: 'Requiere atención',
  cancelled: 'Cancelado',
}

const operationLabel: Record<string, string> = {
  'delivery.plan': 'Preparando el plan',
  'delivery.implementation': 'Construyendo el cambio',
  'delivery.publish': 'Preparando la publicación',
  'delivery.qa': 'Validando y reuniendo evidencia',
  'delivery.summary': 'Preparando la entrega',
}

const workflowStages = ['Resultado', 'Plan', 'Ejecución', 'Validado'] as const

function workflowStageIndex(snapshot: WorkspaceSnapshot) {
  if (snapshot.pulse.tone === 'complete') return 3
  if (snapshot.pulse.tone === 'attention') return 1
  if (snapshot.pulse.tone === 'incident' || snapshot.pulse.tone === 'live' || snapshot.pulse.tone === 'stopping') return 2
  return 0
}

function singular(count: number, singularLabel: string, pluralLabel = `${singularLabel}s`) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`
}

function formatRelativeUpdate(value?: string) {
  if (!value) return 'Sin señal reciente'
  const updatedAt = new Date(value).getTime()
  if (Number.isNaN(updatedAt)) return 'Sin señal reciente'

  const minutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000))
  if (minutes < 2) return 'Actualizado ahora'
  if (minutes < 60) return `Hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'Ayer' : `Hace ${days} días`
}

function asWorkspaceTask(task: { id: string; operation: string; status: DeliveryTaskStatus; created_at?: string; completed_at?: string; createdAt?: string; completedAt?: string }): WorkspaceTask {
  const created_at = task.created_at ?? task.createdAt ?? ''
  return { id: task.id, operation: task.operation, status: task.status, created_at, ...(task.completed_at ?? task.completedAt ? { completed_at: task.completed_at ?? task.completedAt } : {}) }
}

function asWorkspaceWorkItem(workItem: DeliveryPortfolioWorkItem | DeliveryWorkItem): WorkspaceWorkItem {
  return {
    id: workItem.id,
    title: workItem.title,
    state: workItem.state,
    updated_at: 'updatedAt' in workItem ? workItem.updatedAt : workItem.updated_at,
    automation_tasks_truncated: 'automationTasksTruncated' in workItem ? workItem.automationTasksTruncated : undefined,
    automation_tasks:
      'automationTasks' in workItem
        ? workItem.automationTasks.map(asWorkspaceTask)
        : workItem.automation_tasks?.map(asWorkspaceTask),
  }
}

function asWorkspaceProject(project: DeliveryProject): WorkspaceProject {
  const workItems = project.work_items
  return {
    id: project.id,
    client_id: project.client_id,
    name: project.name,
    summary: project.summary,
    status: project.status,
    updated_at: project.updated_at,
    client: project.client,
    context_count: Array.isArray(project.context) ? project.context.length : undefined,
    work_items: workItems?.map(asWorkspaceWorkItem),
    work_item_count: Array.isArray(workItems) ? workItems.length : undefined,
    active_work_items: Array.isArray(workItems) ? workItems.filter((item) => activeStates.has(item.state)).length : undefined,
    decisions_required: Array.isArray(workItems) ? workItems.filter((item) => decisionStates.has(item.state)).length : undefined,
    blocked_work_items: Array.isArray(workItems) ? workItems.filter((item) => item.state === 'blocked').length : undefined,
    attention_tasks: workItems?.reduce(
      (count, item) => count + unresolvedFailedTasks(item.automation_tasks ?? []).length,
      0
    ),
    work_items_truncated: false,
  }
}

function asPortfolioWorkspace(project: DeliveryPortfolioProject): WorkspaceProject {
  return {
    id: project.id,
    client_id: project.clientId,
    name: project.name,
    status: project.status,
    updated_at: project.updatedAt,
    client: project.client,
    work_items: project.workItems.map(asWorkspaceWorkItem),
    work_item_count: project.workItemCount,
    active_work_items: project.activeWorkItems,
    decisions_required: project.decisionsRequired,
    blocked_work_items: project.blockedWorkItems,
    attention_tasks: project.attentionTasks,
    work_items_truncated: project.workItemsTruncated,
  }
}

function projectSummary(project: WorkspaceProject) {
  const summary = project.summary?.trim()
  if (!summary) return ''

  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const title = normalize(project.name)
  const comparableSummary = normalize(summary)
  return comparableSummary === title || comparableSummary.startsWith(`${title} `) ? '' : summary
}

function workspaceSnapshot(project: WorkspaceProject): WorkspaceSnapshot {
  const hasOutcomeData = typeof project.work_item_count === 'number' || Array.isArray(project.work_items)
  const outcomes = project.work_items ?? []
  const totalOutcomes = project.work_item_count ?? outcomes.length
  const hasCompleteOutcomeSet = hasOutcomeData && !project.work_items_truncated && outcomes.length === totalOutcomes
  const deliveredOutcomes = outcomes.filter((item) => item.state === 'released').length
  // A cancellation request is an active safe closure, not an unresolved
  // incident. Match the v2 portfolio read model when this page falls back to
  // locally derived totals during a rolling backend update.
  const blocked = outcomes.filter(
    (item) => item.state === 'blocked' && !hasCancellationRequest(item.automation_tasks ?? [])
  )
  const decisions = outcomes.filter(
    (item) => decisionStates.has(item.state) && !hasCancellationRequest(item.automation_tasks ?? [])
  )
  const stopping = outcomes.filter((item) => hasCancellationRequest(item.automation_tasks ?? []))
  const active = outcomes.filter((item) => activeStates.has(item.state) && !hasCancellationRequest(item.automation_tasks ?? []))
  const blockedOutcomes = hasCompleteOutcomeSet ? blocked.length : project.blocked_work_items ?? blocked.length
  const attentionOutcomes = hasCompleteOutcomeSet ? decisions.length : project.decisions_required ?? decisions.length
  // The v2 portfolio read model already excludes safe closures from its
  // compact count. With a complete result set we still derive it locally so
  // the UI also stays faithful during a rolling backend upgrade.
  const activeOutcomes = hasCompleteOutcomeSet ? active.length : project.active_work_items ?? active.length
  const canDeriveAttention = hasCompleteOutcomeSet && outcomes.every((item) => !item.automation_tasks_truncated)
  const visibleAttentionTasks = outcomes.reduce(
    (count, item) =>
      count + (hasCancellationRequest(item.automation_tasks ?? []) ? 0 : unresolvedFailedTasks(item.automation_tasks ?? []).length),
    0,
  )
  const attentionTasks = canDeriveAttention ? visibleAttentionTasks : project.attention_tasks ?? visibleAttentionTasks
  const failedOutcome = outcomes.find(
    (item) => !hasCancellationRequest(item.automation_tasks ?? []) && unresolvedFailedTasks(item.automation_tasks ?? []).length > 0
  )
  const focus = blocked[0] ?? failedOutcome ?? decisions[0] ?? stopping[0] ?? active[0] ?? outcomes.find((item) => item.state !== 'released')
  const activeTask = active
    .flatMap((item) => item.automation_tasks ?? [])
    .filter((task) => task.status === 'running' || task.status === 'queued')
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
  const activeTaskIsRunning = activeTask?.status === 'running'
  const progress = hasCompleteOutcomeSet && totalOutcomes ? Math.round((deliveredOutcomes / totalOutcomes) * 100) : 0

  if (!hasOutcomeData) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes: 0,
      deliveredOutcomes: 0,
      activeOutcomes: 0,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks: 0,
      progress: 0,
      focus: undefined,
      pulse:
        project.status === 'paused'
          ? { tone: 'paused', label: 'En pausa', detail: 'El flujo se reanuda desde este resultado.' }
          : { tone: 'ready', label: 'Workspace activo', detail: 'Abre para seguir el flujo en vivo.' },
    }
  }

  if (project.status === 'paused') {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes,
      blockedOutcomes,
      attentionTasks,
      progress,
      focus,
      pulse: { tone: 'paused', label: 'En pausa', detail: 'El flujo se reanuda desde este resultado.' },
    }
  }

  if (blockedOutcomes > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes,
      blockedOutcomes,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'incident',
        label: 'Atención requerida',
        detail: focus?.title ?? `${singular(blockedOutcomes, 'resultado')} bloqueado`,
      },
    }
  }

  if (attentionTasks > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'incident',
        label: 'Ejecución detenida',
        detail: `${singular(attentionTasks, 'ejecución')} necesita revisión${focus ? ` · ${focus.title}` : ''}`,
      },
    }
  }

  if (attentionOutcomes > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes,
      blockedOutcomes: 0,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'attention',
        label: 'Decisión lista',
        detail: focus?.title ?? `${singular(attentionOutcomes, 'decisión', 'decisiones')} pendiente`,
      },
    }
  }

  if (stopping.length > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'stopping',
        label: 'Detención en curso',
        detail: focus?.title ?? `${singular(stopping.length, 'ejecución')} cerrándose de forma segura`,
      },
    }
  }

  if (activeOutcomes > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'live',
        label: activeTask ? (activeTaskIsRunning ? 'Agente en marcha' : 'Preparando ejecución') : 'Ruta en marcha',
        detail: activeTask
          ? operationLabel[activeTask.operation] ?? stateLabel[focus?.state ?? ''] ?? 'Ejecutando el siguiente paso'
          : focus ? (stateLabel[focus.state] ?? focus.state) : `${singular(activeOutcomes, 'resultado')} en ejecución`,
      },
    }
  }

  if (hasCompleteOutcomeSet && totalOutcomes > 0 && deliveredOutcomes === totalOutcomes) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes: 0,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks,
      progress: 100,
      focus,
      pulse: { tone: 'complete', label: 'Resultados entregados', detail: 'Todo el flujo terminó con evidencia.' },
    }
  }

  if (totalOutcomes > 0) {
    return {
      hasOutcomeData,
      hasCompleteOutcomeSet,
      totalOutcomes,
      deliveredOutcomes,
      activeOutcomes: 0,
      attentionOutcomes: 0,
      blockedOutcomes: 0,
      attentionTasks,
      progress,
      focus,
      pulse: {
        tone: 'ready',
        label: 'Listo para avanzar',
        detail: focus?.title ?? 'El agente puede tomar el siguiente paso.',
      },
    }
  }

  return {
    hasOutcomeData,
    hasCompleteOutcomeSet,
    totalOutcomes: 0,
    deliveredOutcomes: 0,
    activeOutcomes: 0,
    attentionOutcomes: 0,
    blockedOutcomes: 0,
    attentionTasks: 0,
    progress: 0,
    focus: undefined,
    pulse: {
      tone: 'ready',
      label: 'Listo para un resultado',
      detail: 'Define un resultado y el agente arma el recorrido.',
    },
  }
}

function pulsePresentation(tone: PulseTone) {
  const presentation = {
    live: { dot: 'bg-sky-400', text: 'text-sky-700 dark:text-sky-300' },
    stopping: { dot: 'bg-zinc-400', text: 'text-ink-secondary' },
    attention: {
      dot: 'bg-amber-400',
      text: 'text-amber-800 dark:text-amber-300',
    },
    incident: {
      dot: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-300',
    },
    complete: {
      dot: 'bg-emerald-400',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    paused: { dot: 'bg-zinc-400', text: 'text-ink-secondary' },
    ready: {
      dot: 'bg-(--tenant-accent)',
      text: 'text-(--tenant-accent)',
    },
  }
  return presentation[tone]
}

function workspaceRank(snapshot: WorkspaceSnapshot) {
  if (snapshot.pulse.tone === 'incident') return 0
  if (snapshot.pulse.tone === 'attention') return 1
  if (snapshot.pulse.tone === 'live') return 2
  if (snapshot.pulse.tone === 'stopping') return 3
  if (snapshot.pulse.tone === 'ready') return 4
  if (snapshot.pulse.tone === 'paused') return 5
  return 6
}

export default function DeliveryProjectsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const portfolioQuery = useSWR<DeliveryPortfolioSnapshot | null>(
    automationPortfolioPath(),
    async (path) => normalizeDeliveryPortfolio(await fetcher(path)),
    { refreshInterval: deliveryPortfolioRefreshInterval, dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const needsProjectRecovery = Boolean(portfolioQuery.error || (!portfolioQuery.data && !portfolioQuery.isLoading))
  const projects = useSWR<DeliveryProject[]>(
    needsProjectRecovery ? deliveryProjectsPath() : null,
    fetcher,
    { refreshInterval: 15_000, dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const [clientId, setClientId] = useState('')
  const [intent, setIntent] = useState('')
  const [creating, setCreating] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const intentFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const clientFieldRef = useRef<HTMLSelectElement | null>(null)
  const clients = useSWR<ClientsPageResponse>(
    composerOpen ? clientsPagePath({ page: 1, page_size: 100 }) : null,
    fetcher,
    { dedupingInterval: 15_000, keepPreviousData: true }
  )
  const [filter, setFilter] = useState<PortfolioFilter>('all')
  const [message, setMessage] = useState('')

  const portfolioSnapshot = portfolioQuery.data ?? null
  const hasPortfolioSnapshot = portfolioSnapshot !== null
  const items = useMemo<WorkspaceProject[]>(
    () => (portfolioSnapshot ? portfolioSnapshot.projects.map(asPortfolioWorkspace) : (projects.data ?? emptyProjects).map(asWorkspaceProject)),
    [portfolioSnapshot, projects.data]
  )
  const clientItems = useMemo(() => clients.data?.data ?? [], [clients.data])
  // The single-client path is a resolved destination immediately; do not make
  // the primary action wait for a follow-up state update just to enable it.
  const resolvedClientId = clientId || (clientItems.length === 1 ? clientItems[0].id : '')
  const clientSelectionUnavailable = !clients.isLoading && !clients.error && clientItems.length === 0

  useEffect(() => {
    // When this workspace has one client, the choice is unambiguous. Remove
    // the administrative step but keep the selector visible as an escape
    // hatch if more clients are added later.
    if (!composerOpen || clientItems.length !== 1 || clientId) return
    setClientId(clientItems[0].id)
  }, [clientId, clientItems, composerOpen])

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setMessage('')
    setComposerOpen(true)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('create')
    router.replace(`/automation/projects${nextParams.size ? `?${nextParams}` : ''}`, { scroll: false })
  }, [router, searchParams])

  useEffect(() => {
    if (!composerOpen || clients.isLoading || clientSelectionUnavailable) return
    // A result begins with intent. Skip the administrative selector when it
    // has already been resolved; otherwise make the one required choice clear.
    const frame = window.requestAnimationFrame(() => {
    if (resolvedClientId) intentFieldRef.current?.focus()
    else clientFieldRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [clientSelectionUnavailable, clients.isLoading, composerOpen, resolvedClientId])

  const workspaces = useMemo(
    () =>
      items
        .map((project) => ({ project, snapshot: workspaceSnapshot(project) }))
        .sort((left, right) => {
          const rankDifference = workspaceRank(left.snapshot) - workspaceRank(right.snapshot)
          if (rankDifference !== 0) return rankDifference
          return new Date(right.project.updated_at).getTime() - new Date(left.project.updated_at).getTime()
        }),
    [items]
  )

  const portfolio = useMemo(() => {
    const activeProjects = items.filter((project) => project.status === 'active').length
    if (portfolioSnapshot) {
      return {
        activeProjects,
        hasOutcomeData: true,
        totalOutcomes: portfolioSnapshot.totals.workItems,
        liveOutcomes: portfolioSnapshot.totals.activeWorkItems,
        attentionOutcomes: portfolioSnapshot.totals.decisionsRequired + portfolioSnapshot.totals.blockedWorkItems + portfolioSnapshot.totals.attentionTasks,
        deliveredOutcomes: 0,
        liveWorkspaces: items.filter((workspace) => workspace.active_work_items && workspace.active_work_items > 0).length,
        attentionWorkspaces: items.filter(
          (workspace) =>
            (workspace.decisions_required ?? 0) +
              (workspace.blocked_work_items ?? 0) +
              (workspace.attention_tasks ?? 0) >
            0
        ).length,
        pausedWorkspaces: items.filter((workspace) => workspace.status === 'paused').length,
      }
    }
    return {
      activeProjects,
      hasOutcomeData: workspaces.some((workspace) => workspace.snapshot.hasOutcomeData),
      totalOutcomes: workspaces.reduce((sum, workspace) => sum + workspace.snapshot.totalOutcomes, 0),
      liveOutcomes: workspaces.reduce((sum, workspace) => sum + workspace.snapshot.activeOutcomes, 0),
      attentionOutcomes: workspaces.reduce(
        (sum, workspace) => sum + workspace.snapshot.attentionOutcomes + workspace.snapshot.blockedOutcomes + workspace.snapshot.attentionTasks,
        0
      ),
      deliveredOutcomes: workspaces.reduce((sum, workspace) => sum + workspace.snapshot.deliveredOutcomes, 0),
      liveWorkspaces: workspaces.filter(
        (workspace) =>
          workspace.snapshot.pulse.tone === 'live' ||
          (!workspace.snapshot.hasOutcomeData && workspace.project.status === 'active')
      ).length,
      attentionWorkspaces: workspaces.filter(
        (workspace) => workspace.snapshot.pulse.tone === 'attention' || workspace.snapshot.pulse.tone === 'incident'
      ).length,
      pausedWorkspaces: workspaces.filter((workspace) => workspace.project.status === 'paused').length,
    }
  }, [items, portfolioSnapshot, workspaces])

  const visibleWorkspaces = useMemo(
    () =>
      workspaces.filter((workspace) => {
        if (filter === 'live') {
          return (
            workspace.snapshot.pulse.tone === 'live' ||
            (!workspace.snapshot.hasOutcomeData && workspace.project.status === 'active')
          )
        }
        if (filter === 'attention') return workspace.snapshot.pulse.tone === 'attention' || workspace.snapshot.pulse.tone === 'incident'
        if (filter === 'paused') return workspace.project.status === 'paused'
        if (filter === 'complete') return workspace.snapshot.pulse.tone === 'complete'
        return true
      }),
    [filter, workspaces]
  )

  const hasLoadError = !hasPortfolioSnapshot && needsProjectRecovery && Boolean(projects.error)
  const portfolioSignal = hasLoadError
    ? 'Sincronización pendiente'
    : !portfolio.hasOutcomeData
    ? portfolio.activeProjects > 0
      ? `${singular(portfolio.activeProjects, 'resultado')} activo`
      : 'Listo para iniciar el primer resultado'
    : portfolio.attentionOutcomes > 0
      ? `${singular(portfolio.attentionOutcomes, 'señal', 'señales')} esperando atención`
      : portfolio.liveOutcomes > 0
        ? `${singular(portfolio.liveOutcomes, 'resultado')} avanzando ahora`
        : portfolio.totalOutcomes > 0
          ? `${singular(portfolio.totalOutcomes, 'resultado')} sin intervención pendiente`
          : 'Listo para iniciar el primer resultado'
  const incidentCount = portfolioSnapshot
    ? portfolioSnapshot.totals.blockedWorkItems + portfolioSnapshot.totals.attentionTasks
    : workspaces.reduce((total, workspace) => total + workspace.snapshot.blockedOutcomes + workspace.snapshot.attentionTasks, 0)
  const decisionCount = Math.max(0, portfolio.attentionOutcomes - incidentCount)
  const portfolioSignalTone = hasLoadError ? 'attention' : incidentCount > 0 ? 'incident' : decisionCount > 0 ? 'attention' : 'healthy'
  const priorityWorkspace = workspaces.find((workspace) =>
    workspace.snapshot.pulse.tone === 'incident' || workspace.snapshot.pulse.tone === 'attention'
  )
  const priorityActionLabel = priorityWorkspace
    ? priorityWorkspace.snapshot.pulse.tone === 'incident'
      ? 'Resolver incidencia'
      : priorityWorkspace.snapshot.pulse.label === 'Decisión lista'
        ? 'Tomar decisión'
        : 'Abrir resultado'
    : ''

  const filters: Array<{ value: PortfolioFilter; label: string; count: number }> = [
    { value: 'all', label: 'Todos', count: workspaces.length },
    { value: 'live', label: 'En marcha', count: portfolio.liveWorkspaces },
    { value: 'attention', label: 'Atención', count: portfolio.attentionWorkspaces },
    { value: 'paused', label: 'En pausa', count: portfolio.pausedWorkspaces },
    { value: 'complete', label: 'Entregados', count: workspaces.filter((workspace) => workspace.snapshot.pulse.tone === 'complete').length },
  ]
  const workspaceHeading: Record<PortfolioFilter, string> = {
    all: 'Resultados',
    live: 'En marcha',
    attention: 'Atención requerida',
    paused: 'En pausa',
    complete: 'Entregados',
  }
  const emptyFilterPresentation: Record<PortfolioFilter, { title: string; detail: string }> = {
    all: {
      title: 'Nada que mostrar aquí',
      detail: 'No hay resultados disponibles en este momento.',
    },
    live: {
      title: 'Nada avanzando ahora',
      detail: 'El agente no tiene una ruta activa en este momento.',
    },
    attention: {
      title: 'Sin decisiones pendientes',
      detail: 'Los resultados no necesitan intervención por ahora.',
    },
    paused: {
      title: 'Sin resultados en pausa',
      detail: 'No hay rutas detenidas en este portafolio.',
    },
    complete: {
      title: 'Aún no hay entregas cerradas',
      detail: 'Los resultados terminados aparecerán aquí con su evidencia.',
    },
  }

  function openComposer() {
    setMessage('')
    setComposerOpen(true)
  }

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!resolvedClientId || !intent.trim()) return
    setCreating(true)
    setMessage('')
    try {
      const result = await api.post(deliveryProjectsPath(), { client_id: resolvedClientId, intent: intent.trim() })
      const project = readApiData<DeliveryProject>(result.data)
      setIntent('')
      setComposerOpen(false)
      await projects.mutate()
      await portfolioQuery.mutate()
      router.push(`/automation/projects/${project.id}`)
    } catch {
      setMessage('No pudimos iniciar este workspace. Confirma el cliente y vuelve a intentarlo.')
    } finally {
      setCreating(false)
    }
  }

  function refreshPortfolio() {
    void portfolioQuery.mutate()
    if (needsProjectRecovery) void projects.mutate()
  }

  const isLoading = !hasPortfolioSnapshot && (portfolioQuery.isLoading || (needsProjectRecovery && projects.isLoading))
  const portfolioSessionRecoveryMessage =
    localSessionRecoveryMessage(portfolioQuery.error) ?? localSessionRecoveryMessage(projects.error)
  const isValidating = portfolioQuery.isValidating || (needsProjectRecovery && projects.isValidating)

  return (
    <PageTransition>
      <main className="mx-auto max-w-[88rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <PageHeader
          eyebrow="Resultados"
          title="Resultados en movimiento"
          description="El sistema avanza, deja evidencia y sólo te avisa cuando importa."
          icon={RocketLaunchIcon}
          actions={hasLoadError ? null :
            <Button color="indigo" onClick={openComposer} className="w-full justify-center sm:w-auto">
              <PlusIcon data-slot="icon" />
              Iniciar resultado
            </Button>
          }
        />

        <section
          className={`premium-surface mt-4 overflow-hidden rounded-2xl p-4 sm:hidden ${hasLoadError ? 'hidden' : ''}`}
          aria-label="Pulso del portafolio"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[.14em] text-ink-muted uppercase">Ahora</p>
              <p className="mt-1 truncate text-sm font-semibold text-ink">{portfolioSignal}</p>
            </div>
            <span className={`mt-1 size-2 shrink-0 rounded-full ${portfolioSignalTone === 'incident' ? 'bg-rose-500' : portfolioSignalTone === 'attention' ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
          </div>
          <div className="mt-3 grid grid-cols-2 divide-x divide-border-subtle rounded-xl border border-border-subtle bg-surface-soft/60 py-2.5">
            <div className="px-3">
              <p className="text-[10px] font-semibold tracking-[.1em] text-ink-muted uppercase">En curso</p>
              <p className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{portfolio.hasOutcomeData ? portfolio.liveOutcomes : '—'}</p>
            </div>
            <div className="px-3">
              <p className="text-[10px] font-semibold tracking-[.1em] text-ink-muted uppercase">Atención</p>
              <p className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{portfolio.hasOutcomeData ? portfolio.attentionOutcomes : '—'}</p>
            </div>
          </div>
          {priorityWorkspace ? (
            <Link
              href={`/automation/projects/${priorityWorkspace.project.id}`}
              className={`mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-xs font-semibold ${priorityWorkspace.snapshot.pulse.tone === 'incident' ? 'border-rose-500/25 bg-rose-500/[.05] text-rose-700 dark:text-rose-300' : 'border-amber-500/25 bg-amber-500/[.06] text-amber-800 dark:text-amber-300'}`}
            >
              <span className="min-w-0 truncate">{priorityActionLabel} · {priorityWorkspace.project.name}</span>
              <ArrowRightIcon className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <p className={`mt-3 flex items-center gap-2 text-xs ${hasLoadError ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {hasLoadError ? <ExclamationTriangleIcon className="size-4" aria-hidden="true" /> : <CheckCircleIcon className="size-4" aria-hidden="true" />}
              {hasLoadError ? 'Sincroniza para confirmar el siguiente movimiento.' : 'El agente tiene vía libre.'}
            </p>
          )}
        </section>

        <section className={`premium-surface mt-5 hidden overflow-hidden rounded-2xl sm:block ${hasLoadError ? '!hidden' : ''}`} aria-label="Pulso del portafolio">
          <div className="grid min-h-22 grid-cols-[minmax(0,1fr)_auto_auto] items-stretch divide-x divide-border-subtle">
            <div className="flex min-w-0 items-center gap-3 px-5 py-4">
              <span className={`size-2 shrink-0 rounded-full ${portfolioSignalTone === 'incident' ? 'bg-rose-500' : portfolioSignalTone === 'attention' ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[.14em] text-ink-muted uppercase">Pulso</p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{portfolioSignal}</p>
              </div>
            </div>
            <dl className="flex items-center divide-x divide-border-subtle">
              {[
                ['En curso', portfolio.hasOutcomeData ? portfolio.liveOutcomes : '—'],
                ['Atención', portfolio.hasOutcomeData ? portfolio.attentionOutcomes : '—'],
              ].map(([label, value]) => (
                <div key={label as string} className="min-w-24 px-4 text-center">
                  <dt className="text-[10px] font-semibold tracking-[.1em] text-ink-muted uppercase">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {priorityWorkspace ? (
              <Link
                href={`/automation/projects/${priorityWorkspace.project.id}`}
                className={`flex min-h-11 items-center gap-2 px-4 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) ${priorityWorkspace.snapshot.pulse.tone === 'incident' ? 'text-rose-700 hover:bg-rose-500/[.06] dark:text-rose-300' : 'text-amber-800 hover:bg-amber-500/[.08] dark:text-amber-300'}`}
              >
                <span className="max-w-44 truncate">{priorityActionLabel} · {priorityWorkspace.project.name}</span>
                <ArrowRightIcon className="size-4 shrink-0" />
              </Link>
            ) : (
              <span className={`flex items-center gap-2 px-4 text-xs font-semibold ${hasLoadError ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                {hasLoadError ? <ExclamationTriangleIcon className="size-4" aria-hidden="true" /> : <CheckCircleIcon className="size-4" aria-hidden="true" />}
                {hasLoadError ? 'Pendiente de sincronizar' : 'Sin bloqueos'}
              </span>
            )}
          </div>
        </section>

        <section className="mt-5 sm:mt-6" aria-labelledby="workspaces-title">
          <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="workspaces-title" className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {hasLoadError ? 'Conexión con Automation' : workspaceHeading[filter]}
              </h2>
            </div>
            {!hasLoadError && <button
              type="button"
              onClick={refreshPortfolio}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-3 text-sm font-semibold text-ink-secondary transition hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 sm:self-auto"
            >
              <ArrowPathIcon className={`size-4 ${isValidating ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              Actualizar
            </button>}
          </div>

          {!hasLoadError && <div
            className="mt-4 flex max-w-full snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto"
            role="group"
            aria-label="Filtrar resultados"
          >
            {filters.map((item) => {
              const selected = filter === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(item.value)}
                  className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 ${selected ? 'border-(--tenant-accent)/30 bg-(--tenant-accent)/[.1] text-(--tenant-accent)' : 'border-border-subtle bg-surface-raised text-ink-secondary hover:bg-surface-soft hover:text-ink'}`}
                >
                  {item.label}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${selected ? 'bg-(--tenant-accent)/12' : 'bg-surface-soft text-ink-muted'}`}
                  >
                    {item.count}
                  </span>
                </button>
              )
            })}
          </div>}

          {isLoading ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando resultados">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-36 animate-pulse rounded-[1.5rem] bg-surface-soft motion-reduce:animate-none sm:h-40" />
              ))}
            </div>
          ) : hasLoadError ? (
            <div className="premium-surface mt-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] px-4 py-4 text-left sm:px-5 sm:py-5" role="alert">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ExclamationTriangleIcon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {portfolioSessionRecoveryMessage ? 'La sesión local necesita atención' : 'No pudimos cargar el portafolio'}
                </p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-ink-muted">
                  {portfolioSessionRecoveryMessage ?? 'Tus resultados no se han perdido. Intenta sincronizar de nuevo en unos segundos.'}
                </p>
              </div>
              <Button outline className="w-full sm:w-auto" onClick={refreshPortfolio}>
                <ArrowPathIcon data-slot="icon" />
                {portfolioSessionRecoveryMessage ? 'Actualizar sesión' : 'Reintentar'}
              </Button>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="premium-surface mt-4 flex min-h-72 flex-col items-center justify-center rounded-[1.5rem] px-6 py-12 text-center">
              <span className="flex size-13 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                <RocketLaunchIcon className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink">El portafolio está listo</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">
                Inicia con lo que buscas. El agente prepara el primer movimiento.
              </p>
              <Button color="indigo" className="mt-5" onClick={openComposer}>
                <PlusIcon data-slot="icon" />
                Iniciar resultado
              </Button>
            </div>
          ) : visibleWorkspaces.length === 0 ? (
            <div className="premium-surface mt-4 flex min-h-48 flex-col items-center justify-center rounded-[1.5rem] px-6 py-10 text-center">
              <CheckCircleIcon className="size-8 text-emerald-500" />
              <p className="mt-4 text-sm font-semibold text-ink">{emptyFilterPresentation[filter].title}</p>
              <p className="mt-1 text-sm text-ink-muted">{emptyFilterPresentation[filter].detail}</p>
              <Button plain className="mt-3" onClick={() => setFilter('all')}>
                Ver todos los resultados
              </Button>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleWorkspaces.map(({ project, snapshot }) => {
                const pulse = pulsePresentation(snapshot.pulse.tone)
                const hasOutcomes = snapshot.hasOutcomeData && snapshot.totalOutcomes > 0
                const summary = projectSummary(project)
                const activeStageIndex = workflowStageIndex(snapshot)
                return (
                  <li key={project.id}>
                    <Link
                      href={`/automation/projects/${project.id}`}
                      className="premium-surface premium-surface-interactive group relative block overflow-hidden rounded-[1.5rem] p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 sm:p-5"
                    >
                      <span className="pointer-events-none absolute -top-12 -right-12 size-28 rounded-full bg-(--tenant-accent)/[.06] blur-2xl transition group-hover:bg-(--tenant-accent)/[.1]" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                              <FolderOpenIcon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
                                <UserCircleIcon className="size-4 shrink-0" />
                                <span className="truncate">{project.client?.name ?? 'Cliente sin nombre'}</span>
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                                <ClockIcon className="size-3.5" />
                                {formatRelativeUpdate(project.updated_at)}
                              </span>
                            </span>
                          </div>
                          <ArrowRightIcon className="mt-1 size-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none" />
                        </div>

                        <div className="mt-3.5 min-w-0 sm:mt-4">
                          <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-ink">
                            {project.name}
                          </h3>
                          {summary ? (
                            <p className="mt-1.5 line-clamp-1 text-sm leading-5 text-ink-muted">{summary}</p>
                          ) : null}
                        </div>

                        <div className="mt-3.5 flex min-w-0 items-start gap-2 sm:mt-4">
                          <span className="relative mt-1.5 flex size-2 shrink-0">
                            {snapshot.pulse.tone === 'live' && snapshot.pulse.label === 'Agente en marcha' && (
                              <span
                                className={`absolute inline-flex size-2 animate-ping rounded-full ${pulse.dot} motion-reduce:hidden`}
                              />
                            )}
                            <span className={`relative inline-flex size-2 rounded-full ${pulse.dot}`} />
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-xs font-semibold ${pulse.text}`}>{snapshot.pulse.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-ink-secondary">{snapshot.pulse.detail}</span>
                          </span>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5" aria-label={`Etapa actual: ${workflowStages[activeStageIndex]}`}>
                          {workflowStages.map((stage, index) => (
                            <span key={stage} className="flex min-w-0 flex-1 items-center gap-1">
                              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${index < activeStageIndex ? 'border-emerald-500 bg-emerald-500 text-white' : index === activeStageIndex ? 'border-(--tenant-accent) bg-(--tenant-accent) text-white' : 'border-border-subtle bg-surface-soft text-ink-muted'}`}>{index < activeStageIndex ? '✓' : index + 1}</span>
                              {index < workflowStages.length - 1 ? <span className={`h-px min-w-1 flex-1 ${index < activeStageIndex ? 'bg-emerald-500/45' : 'bg-border-subtle'}`} /> : null}
                            </span>
                          ))}
                        </div>

                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Dialog open={composerOpen} onClose={() => !creating && setComposerOpen(false)} size="lg">
          <DialogTitle>Inicia un resultado</DialogTitle>
          <DialogDescription>
            Dile al agente qué resultado necesitas. La ruta y el primer recorrido se preparan
            automáticamente.
          </DialogDescription>
          <form onSubmit={createProject}>
            <DialogBody className="space-y-4 py-2">
              {clients.isLoading ? (
                <div role="status" aria-live="polite" className="flex min-h-28 items-center gap-3 rounded-2xl bg-surface-soft px-4 text-sm text-ink-secondary">
                  <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  Preparando el destino del resultado…
                </div>
              ) : clients.error ? (
                <div role="alert" className="rounded-2xl border border-amber-500/25 bg-amber-500/[.06] p-4">
                  <p className="text-sm font-semibold text-ink">No pudimos cargar las organizaciones</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Tu intención sigue aquí. Vuelve a sincronizar para elegir dónde debe trabajar el agente.</p>
                  <Button outline type="button" onClick={() => void clients.mutate()} className="mt-3 min-h-10">
                    <ArrowPathIcon data-slot="icon" /> Reintentar
                  </Button>
                </div>
              ) : clientSelectionUnavailable ? (
                <div className="rounded-2xl border border-dashed border-(--tenant-accent)/30 bg-(--tenant-accent)/[.06] p-4">
                  <p className="text-sm font-semibold text-ink">Primero crea la organización de esta entrega</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Así el contexto, las decisiones y los permisos del agente permanecen separados.
                  </p>
                  <Link
                    href="/clients?return_to=automation_create"
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-(--tenant-accent) px-3 text-sm font-semibold text-white transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                  >
                    Crear organización <ArrowRightIcon className="size-4" />
                  </Link>
                </div>
              ) : (
                <>
                  {clientItems.length === 1 ? (
                    <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2 text-xs text-ink-secondary">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      Destino listo: <span className="font-semibold text-ink">{clientItems[0].name}</span>
                    </p>
                  ) : (
                  <label className="block text-sm font-semibold text-ink">
                    Cliente
                    <select
                      ref={clientFieldRef}
                      required
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      className="mt-2 h-12 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink transition outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15"
                    >
                      <option value="">Selecciona un cliente</option>
                      {clientItems.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  )}
                  <label className="block text-sm font-semibold text-ink">
                    ¿Qué resultado necesitas?
                    <textarea
                      ref={intentFieldRef}
                      required
                      value={intent}
                      onChange={(event) => setIntent(event.target.value)}
                      rows={5}
                      maxLength={12000}
                      placeholder="Ej. Quiero que la entrega se pueda revisar desde el teléfono, con evidencia visual clara y sin publicar cambios sin aprobación."
                      className="mt-2 w-full resize-y rounded-2xl border border-border-subtle bg-surface-soft px-3 py-3 text-sm leading-6 text-ink transition outline-none placeholder:text-ink-muted focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2" aria-label="Ejemplos de resultado">
                    {[
                      'Mejorar una pantalla existente',
                      'Resolver una incidencia concreta',
                      'Preparar una entrega revisable',
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setIntent(example)
                          window.requestAnimationFrame(() => intentFieldRef.current?.focus())
                        }}
                        className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary transition hover:border-(--tenant-accent)/30 hover:bg-(--tenant-accent)/[.06] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-ink-muted">
                    El agente propone alcance, validaciones y primer plan. Tú sólo apareces en los gates importantes.
                  </p>
                </>
              )}
              {message && (
                <p
                  role="status"
                  className="rounded-xl bg-rose-500/[.06] px-3 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300"
                >
                  {message}
                </p>
              )}
            </DialogBody>
            <DialogActions className="border-t border-border-subtle pt-5">
              <Button outline type="button" disabled={creating} onClick={() => setComposerOpen(false)}>
                Cancelar
              </Button>
              <Button
                color="indigo"
                type="submit"
                disabled={creating || Boolean(clients.error) || clientSelectionUnavailable || !resolvedClientId || !intent.trim()}
              >
                <SparklesIcon data-slot="icon" />
                {creating ? 'Iniciando…' : 'Poner en marcha'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </main>
    </PageTransition>
  )
}
