'use client'
import { deliveryStageIndex, deliveryStateLabels } from '@/features/automation/delivery-presentation'
import { automationClientOption, isAutomationClient } from '@/features/automation/automation-client-boundary'
import { decodeProjectDraft, encodeProjectDraft, projectDraftKey } from '@/features/automation/project-draft'
import { useStore } from '@/store/useStore'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { ClientFormModal } from '@/components/clients/forms/client-form-modal'
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
import type { Client, ClientsPageResponse } from '@/models/Client'
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

const stateLabel = deliveryStateLabels

const operationLabel: Record<string, string> = {
  'delivery.chat': 'Conversación informativa',
  'delivery.plan': 'Preparando el plan',
  'delivery.implementation': 'Construyendo el cambio',
  'delivery.publish': 'Preparando la publicación',
  'delivery.qa': 'Validando y reuniendo evidencia',
  'delivery.summary': 'Preparando la entrega',
}

const workflowStages = ['Preparación', 'Plan', 'Trabajo y revisión', 'Entregado'] as const

function workflowStageIndex(snapshot: WorkspaceSnapshot) {
  if (snapshot.pulse.tone === 'complete') return 3
  return deliveryStageIndex(snapshot.focus?.state)
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
  const [projectName, setProjectName] = useState('')
  const draftUser = useStore(state => state.user?.id)
  const draftTenant = useStore(state => state.activeTenantCode)
  const draftOrganization = useStore(state => state.currentClient?.id)
  const clientScope = `${draftTenant ?? ''}:${draftOrganization ?? 'platform'}`
  const draftKey = draftUser && draftTenant ? projectDraftKey(draftUser, draftTenant, draftOrganization ?? 'platform') : null
  const draftIdentityRef = useRef<string | null | undefined>(undefined)
  const draftIdentityHydratedRef = useRef(false)
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null)
  useEffect(() => {
    // The auth store can hydrate after this client page has already rendered.
    // If the operator opened the composer and started typing during that gap,
    // do not replace the live form with an empty draft when the identity key
    // becomes available. Once an identity is known, switching to another
    // identity/organization is allowed to load that identity's own draft.
    const previousDraftKey = draftIdentityRef.current
    if (previousDraftKey === draftKey) return
    draftIdentityRef.current = draftKey
    if (!draftKey) {
      setLoadedDraftKey(null)
      return
    }
    if (!draftIdentityHydratedRef.current && previousDraftKey === null && (clientId.trim() || projectName.trim() || intent.trim())) {
      draftIdentityHydratedRef.current = true
      setLoadedDraftKey(draftKey)
      return
    }
    let draft
    try { draft = draftKey ? decodeProjectDraft(sessionStorage.getItem(draftKey)) : undefined } catch { /* Storage may be disabled. */ }
    setClientId(draft?.clientId ?? '')
    setProjectName(draft?.name ?? '')
    setIntent(draft?.objective ?? '')
    draftIdentityHydratedRef.current = true
    setLoadedDraftKey(draftKey)
  }, [clientId, draftKey, intent, projectName])
  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return
    try {
      if (!projectName && !intent) sessionStorage.removeItem(draftKey)
      else sessionStorage.setItem(draftKey, encodeProjectDraft({ clientId, name: projectName, objective: intent }))
    } catch { /* Draft persistence is optional, never block editing. */ }
  }, [draftKey, loadedDraftKey, clientId, projectName, intent])
  const [creating, setCreating] = useState(false)
  const projectCreationAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [clientComposerOpen, setClientComposerOpen] = useState(false)
  // A newly created client is returned by the mutation before the list query
  // necessarily revalidates. Keep it as a scoped optimistic option so the
  // operator can finish this project without waiting for another round trip.
  const [createdClient, setCreatedClient] = useState<Client | null>(null)
  const [createdClientScope, setCreatedClientScope] = useState('')
  const intentFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const clientFieldRef = useRef<HTMLSelectElement | null>(null)
  const clients = useSWR<ClientsPageResponse>(
    composerOpen ? clientsPagePath({ page: 1, page_size: 100 }) : null,
    fetcher,
    { dedupingInterval: 15_000, keepPreviousData: true }
  )
  const [filter, setFilter] = useState<PortfolioFilter>('all')
  const [message, setMessage] = useState('')
  const clientFilterId = searchParams.get('client') ?? ''

  const portfolioSnapshot = portfolioQuery.data ?? null
  const hasPortfolioSnapshot = portfolioSnapshot !== null
  const items = useMemo<WorkspaceProject[]>(
    () => (portfolioSnapshot ? portfolioSnapshot.projects.map(asPortfolioWorkspace) : (projects.data ?? emptyProjects).map(asWorkspaceProject)),
    [portfolioSnapshot, projects.data]
  )
  const clientItems = useMemo(() => {
    const serverClients = clients.data?.data ?? []
    if (!createdClient || createdClientScope !== clientScope || serverClients.some(client => client.id === createdClient.id)) return serverClients
    return [...serverClients, createdClient]
  }, [clients.data, clientScope, createdClient, createdClientScope])
  const automationClientItems = useMemo(() => clientItems.filter(isAutomationClient), [clientItems])
  const projectClientOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const project of items) {
      if (project.client_id && project.client?.name) names.set(project.client_id, project.client.name)
    }
    for (const client of automationClientItems) names.set(client.id, client.name)
    return [...names].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name))
  }, [automationClientItems, items])
  const selectedClientFilterName = projectClientOptions.find((client) => client.id === clientFilterId)?.name
  // The single-client path is a resolved destination immediately; do not make
  // the primary action wait for a follow-up state update just to enable it.
  const resolvedClientId = clientId && automationClientItems.some((client) => client.id === clientId)
    ? clientId
    : automationClientItems.length === 1
      ? automationClientItems[0].id
      : ''
  const clientSelectionUnavailable = !clients.isLoading && !clients.error && automationClientItems.length === 0

  useEffect(() => {
    // When this workspace has one client, the choice is unambiguous. Remove
    // the administrative step but keep the selector visible as an escape
    // hatch if more clients are added later.
    if (!composerOpen || automationClientItems.length !== 1 || clientId) return
    setClientId(automationClientItems[0].id)
  }, [automationClientItems, clientId, composerOpen])

  useEffect(() => {
    // A draft may have been created before the product boundary was enforced.
    // Clear a now-protected destination instead of leaving a disabled option
    // looking selected or allowing a stale draft to influence submission.
    if (!composerOpen || !clientId || clients.isLoading || clients.error || clientItems.some((client) => client.id === clientId && isAutomationClient(client))) return
    setClientId('')
  }, [clientId, clientItems, clients.error, clients.isLoading, composerOpen])

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    const requestedClientId = searchParams.get('client')
    if (requestedClientId) setClientId(requestedClientId)
    setMessage('')
    setComposerOpen(true)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('create')
    // Strip the one-shot launcher flag without scheduling a competing route
    // transition. A pending router.replace could race a successful create and
    // put the operator back on the list after we navigate to the new project.
    const nextURL = `/automation/projects${nextParams.size ? `?${nextParams}` : ''}`
    window.history.replaceState(window.history.state, '', nextURL)
  }, [searchParams])

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

  const clientWorkspaces = useMemo(
    () => clientFilterId ? workspaces.filter(({ project }) => project.client_id === clientFilterId) : workspaces,
    [clientFilterId, workspaces]
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
      clientWorkspaces.filter((workspace) => {
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
    [clientWorkspaces, filter]
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
    { value: 'all', label: 'Todos', count: clientWorkspaces.length },
    { value: 'live', label: 'En marcha', count: clientWorkspaces.filter((workspace) => workspace.snapshot.pulse.tone === 'live' || (!workspace.snapshot.hasOutcomeData && workspace.project.status === 'active')).length },
    { value: 'attention', label: 'Atención', count: clientWorkspaces.filter((workspace) => workspace.snapshot.pulse.tone === 'attention' || workspace.snapshot.pulse.tone === 'incident').length },
    { value: 'paused', label: 'En pausa', count: clientWorkspaces.filter((workspace) => workspace.project.status === 'paused').length },
    { value: 'complete', label: 'Entregados', count: clientWorkspaces.filter((workspace) => workspace.snapshot.pulse.tone === 'complete').length },
  ]
  const workspaceHeading: Record<PortfolioFilter, string> = {
    all: 'Proyectos',
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
    if (clientFilterId) setClientId(clientFilterId)
    setComposerOpen(true)
  }

  function changeClientFilter(nextClientId: string) {
    setFilter('all')
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextClientId) nextParams.set('client', nextClientId)
    else nextParams.delete('client')
    const query = nextParams.toString()
    router.replace(`/automation/projects${query ? `?${query}` : ''}`, { scroll: false })
  }

  function openClientComposer() {
    // Keep the project dialog as a single modal. The draft effect persists the
    // current fields, and the saved client is selected when we return.
    setComposerOpen(false)
    setClientComposerOpen(true)
  }

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!resolvedClientId || !intent.trim() || !projectName.trim() || !automationClientItems.some(client => client.id === resolvedClientId)) return
    setCreating(true)
    setMessage('')
    try {
      const payload = { client_id: resolvedClientId, name: projectName.trim(), summary: intent.trim() }
      const fingerprint = JSON.stringify(payload)
      let attempt = projectCreationAttemptRef.current
      if (!attempt || attempt.fingerprint !== fingerprint) {
        attempt = { fingerprint, key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` }
        projectCreationAttemptRef.current = attempt
      }
      const result = await api.post(deliveryProjectsPath(), payload, { headers: { 'Idempotency-Key': attempt.key } })
      const project = readApiData<DeliveryProject>(result.data)
      if (!project?.id) throw new Error('Project creation returned no id')
      projectCreationAttemptRef.current = null
      setIntent('')
      setProjectName('')
      setCreatedClient(null)
      setCreatedClientScope('')
      setComposerOpen(false)
      // Navigation is part of the successful mutation contract. Refreshing
      // the list is useful, but it must not hold the operator on the composer
      // when a background revalidation is slow or temporarily unavailable.
      router.push(`/automation/projects/${project.id}`)
      void projects.mutate()
      void portfolioQuery.mutate()
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
      <div className="mx-auto max-w-[88rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <nav aria-label="Jerarquía del portafolio" className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted">
          <Link href="/clients" className="min-h-8 inline-flex items-center rounded-md hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35">Organizaciones</Link>
          <span aria-hidden="true">/</span>
          <Link href="/automation/clients" className="min-h-8 inline-flex items-center rounded-md hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35">{selectedClientFilterName ?? 'Clientes'}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="font-semibold text-ink-secondary">Proyectos</span>
        </nav>
        <PageHeader
          eyebrow={selectedClientFilterName ? `Empresa · ${selectedClientFilterName}` : 'Clientes y proyectos'}
          title="Proyectos"
          description={selectedClientFilterName
            ? `Proyectos de ${selectedClientFilterName}. Cada espacio conserva sus propios repositorios, contexto, épicas y ejecuciones.`
            : 'Explora los proyectos por empresa; cada espacio conserva sus propios repositorios, contexto, épicas y ejecuciones.'}
          icon={RocketLaunchIcon}
          actions={hasLoadError ? null :
            <Button color="indigo" onClick={openComposer} className="w-full justify-center sm:w-auto">
              <PlusIcon data-slot="icon" />
              Crear proyecto
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

          {!hasLoadError && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex max-w-full snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto"
              role="group"
              aria-label="Filtrar proyectos"
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
            </div>

            {projectClientOptions.length > 0 && <label className="flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary sm:self-auto">
              <span>Cliente</span>
              <select
                aria-label="Filtrar proyectos por cliente"
                value={clientFilterId}
                onChange={(event) => changeClientFilter(event.target.value)}
                className="max-w-52 bg-transparent text-sm font-semibold text-ink outline-none"
              >
                <option value="">Todos los clientes</option>
                {clientFilterId && !projectClientOptions.some((client) => client.id === clientFilterId) ? <option value={clientFilterId}>Cliente seleccionado</option> : null}
                {projectClientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>}
          </div>}

          {!hasLoadError && clientFilterId && <p className="mt-2 px-1 text-xs leading-5 text-ink-muted">
            Viendo proyectos de <span className="font-semibold text-ink-secondary">{selectedClientFilterName ?? 'este cliente'}</span>. El pulso superior resume todo el portafolio.
          </p>}

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
          ) : clientWorkspaces.length === 0 ? (
            <div className="premium-surface mt-4 flex min-h-72 flex-col items-center justify-center rounded-[1.5rem] px-6 py-12 text-center">
              <span className="flex size-13 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                <RocketLaunchIcon className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{clientFilterId ? `Aún no hay proyectos para ${selectedClientFilterName ?? 'este cliente'}` : 'El portafolio está listo'}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">
                {clientFilterId ? 'Crea el espacio de trabajo aquí; su configuración de repositorios, ambientes y entrega será independiente.' : 'Inicia con lo que buscas. El agente prepara el primer movimiento.'}
              </p>
              <Button color="indigo" className="mt-5" onClick={openComposer}>
                <PlusIcon data-slot="icon" />
                {clientFilterId ? `Crear proyecto para ${selectedClientFilterName ?? 'este cliente'}` : 'Crear proyecto'}
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
          <DialogTitle>Crear proyecto</DialogTitle>
          <DialogDescription>
            Guarda un espacio de trabajo para este cliente. Después prepararás repositorios y crearás el primer encargo; este paso no ejecuta al agente.
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
                <div className="rounded-2xl border border-dashed border-amber-500/35 bg-amber-500/[.06] p-4">
                  <p className="text-sm font-semibold text-ink">Necesitas una organización ITBEM para automatizar</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Las organizaciones EventiApp y de otros productos permanecen protegidas y no pueden abrir un workspace de agentes desde aquí.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button color="indigo" type="button" onClick={openClientComposer}>
                      <PlusIcon data-slot="icon" /> Crear cliente aquí
                    </Button>
                    <Link
                      href="/clients"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-ink-secondary transition hover:bg-surface-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                    >
                      Ver administración <ArrowRightIcon className="size-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {automationClientItems.length === 1 ? (
                    <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2 text-xs text-ink-secondary">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      Destino listo: <span className="font-semibold text-ink">{automationClientItems[0].name}</span>
                    </p>
                  ) : (
                  <div>
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
                        {clientItems.map((client) => {
                          const option = automationClientOption(client)
                          return (
                          <option key={client.id} value={client.id} disabled={!option.selectable}>
                            {option.selectable ? client.name : `${client.name} · protegido`}
                          </option>
                          )
                        })}
                      </select>
                    </label>
                    {clientItems.some((client) => !isAutomationClient(client)) && (
                      <p className="mt-2 text-xs leading-5 text-ink-muted">
                        Los destinos protegidos se muestran para que entiendas el alcance, pero no son seleccionables para automatización ITBEM.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={openClientComposer}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35"
                    >
                      <PlusIcon className="size-3.5" /> Crear un cliente nuevo sin salir
                    </button>
                  </div>
                  )}
                  {resolvedClientId && !clientItems.some(client => client.id === resolvedClientId) && <p role="alert" className="text-sm text-ink-secondary">El cliente del borrador ya no está disponible en este espacio. Selecciona uno autorizado; tu nombre y objetivo se conservan.</p>}
                  <label className="block text-sm font-semibold text-ink">
                    Nombre del proyecto
                    <input required maxLength={180} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ej. Portal de clientes" className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm" />
                  </label>
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
                    Un proyecto puede contener varios trabajos. Guardarlo no aprueba cambios, publica código ni consume inferencia. El borrador se conserva en esta pestaña hasta 24 horas si el navegador lo permite. No incluyas secretos.
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
                disabled={creating || clients.isLoading || Boolean(clients.error) || clientSelectionUnavailable || !clientItems.some(client => client.id === resolvedClientId) || !intent.trim() || !projectName.trim()}
              >
                <SparklesIcon data-slot="icon" />
                {creating ? 'Guardando…' : 'Crear proyecto'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
        <ClientFormModal
          isOpen={clientComposerOpen}
          setIsOpen={setClientComposerOpen}
          restrictTypeCode="CUSTOMER"
          onSaved={async (client) => {
            if (!client?.id) return
            setCreatedClient(client)
            setCreatedClientScope(clientScope)
            setClientId(client.id)
            setComposerOpen(true)
            setMessage('Cliente creado y seleccionado. Puedes continuar con el proyecto.')
            window.requestAnimationFrame(() => intentFieldRef.current?.focus())
          }}
        />
      </div>
    </PageTransition>
  )
}
