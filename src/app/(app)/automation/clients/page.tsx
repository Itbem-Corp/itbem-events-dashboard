'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { PageTransition } from '@/components/ui/page-transition'
import {
  deliveryPortfolioRefreshInterval,
  normalizeDeliveryPortfolio,
  type DeliveryPortfolioProject,
  type DeliveryPortfolioSnapshot,
  type DeliveryPortfolioWorkItem,
} from '@/features/automation/delivery-portfolio'
import { hasCancellationRequest, hasUnresolvedTaskFailure } from '@/features/automation/delivery-task-status'
import type { DeliveryClientOverview, DeliveryProject, DeliveryTaskStatus, DeliveryWorkItem } from '@/features/automation/delivery-types'
import { api, localSessionRecoveryMessage } from '@/lib/api'
import { automationPortfolioPath, clientsPagePath, deliveryClientProfilePath, deliveryClientsPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { ClientsPageResponse } from '@/models/Client'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  PlusIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import useSWR from 'swr'

type Health = 'healthy' | 'watch' | 'at_risk'
type ClientFilter = 'all' | 'active' | 'attention'
type FlowTone = 'attention' | 'decision' | 'active' | 'complete' | 'waiting'

type ClientFlowTask = {
  operation: string
  status: DeliveryTaskStatus
  created_at: string
  completed_at?: string
}

type ClientFlowWorkItem = {
  id: string
  title: string
  state: string
  updated_at: string
  automation_tasks?: ClientFlowTask[]
}

type ClientPortfolioProject = {
  id: string
  client_id: string
  client_name: string
  name: string
  updated_at: string
  work_item_count: number
  active_work_items: number
  decisions_required: number
  blocked_work_items: number
  attention_tasks: number
  work_items: ClientFlowWorkItem[]
}

type ClientRow = {
  client: DeliveryClientOverview
  projects: ClientPortfolioProject[]
  workItems: ClientFlowWorkItem[]
  flowCount: number
  activeCount: number
  attentionCount: number
  executionAttentionCount: number
}

const healthMeta: Record<Health, { label: string; color: 'emerald' | 'amber' | 'rose'; dot: string }> = {
  healthy: { label: 'Estable', color: 'emerald', dot: 'bg-emerald-500' },
  watch: { label: 'En seguimiento', color: 'amber', dot: 'bg-amber-500' },
  at_risk: { label: 'Requiere atención', color: 'rose', dot: 'bg-rose-500' },
}

function lines(value: string) {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
}

function jsonLines(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

function safeTime(value?: string) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function relativeTime(value?: string) {
  const timestamp = safeTime(value)
  if (!timestamp) return 'sin actividad'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL'
}

function asClientFlowWorkItem(workItem: DeliveryPortfolioWorkItem | DeliveryWorkItem): ClientFlowWorkItem {
  return {
    id: workItem.id,
    title: workItem.title,
    state: workItem.state,
    updated_at: 'updatedAt' in workItem ? workItem.updatedAt : workItem.updated_at,
    automation_tasks:
      'automationTasks' in workItem
        ? workItem.automationTasks.map((task) => ({
            operation: task.operation,
            status: task.status,
            created_at: task.createdAt,
            ...(task.completedAt ? { completed_at: task.completedAt } : {}),
          }))
        : workItem.automation_tasks?.map((task) => ({
            operation: task.operation,
            status: task.status,
            created_at: task.created_at,
            ...(task.completed_at ? { completed_at: task.completed_at } : {}),
          })),
  }
}

function asClientPortfolioProject(project: DeliveryPortfolioProject): ClientPortfolioProject {
  return {
    id: project.id,
    client_id: project.clientId,
    client_name: project.client.name,
    name: project.name,
    updated_at: project.updatedAt,
    work_item_count: project.workItemCount,
    active_work_items: project.activeWorkItems,
    decisions_required: project.decisionsRequired,
    blocked_work_items: project.blockedWorkItems,
    attention_tasks: project.attentionTasks,
    work_items: project.workItems.map(asClientFlowWorkItem),
  }
}

function requiresHuman(workItem: ClientFlowWorkItem) {
  // Once a safe closure was requested, it becomes the truthful current
  // movement. Do not leave a historical failed attempt or review as the
  // headline signal while the agent is already winding the run down.
  if (isStopping(workItem)) return false
  return workItem.state.includes('review') ||
    workItem.state === 'blocked' ||
    hasUnresolvedTaskFailure(workItem.automation_tasks ?? [])
}

function isActive(workItem: ClientFlowWorkItem) {
  if (['released', 'cancelled', 'blocked'].includes(workItem.state) || requiresHuman(workItem)) return false
  const tasks = workItem.automation_tasks ?? []
  if (isStopping(workItem)) return false
  return tasks.some((task) => task.status === 'running' || task.status === 'queued')
}

function isStopping(workItem: ClientFlowWorkItem) {
  return hasCancellationRequest(workItem.automation_tasks ?? [])
}

function workItemTone(workItem: ClientFlowWorkItem): FlowTone {
  if (isStopping(workItem)) return 'waiting'
  if (workItem.state === 'blocked' || hasUnresolvedTaskFailure(workItem.automation_tasks ?? [])) return 'attention'
  if (requiresHuman(workItem)) return 'decision'
  if (workItem.automation_tasks?.some((task) => task.status === 'running' || task.status === 'queued')) return 'active'
  if (workItem.state === 'released') return 'complete'
  return 'waiting'
}

function workItemLabel(workItem: ClientFlowWorkItem) {
  if (isStopping(workItem)) return 'Deteniéndose'
  if (workItem.state === 'blocked') return 'Bloqueado'
  if (workItem.state === 'cancelled') return 'Cancelado'
  if (workItem.state.includes('review')) return 'Decisión pendiente'
  if (workItem.state === 'released') return 'Entregado'
  if (hasUnresolvedTaskFailure(workItem.automation_tasks ?? [])) return 'Ejecución detenida'
  if (workItem.automation_tasks?.some((task) => task.status === 'running')) return 'Agente activo'
  if (workItem.automation_tasks?.some((task) => task.status === 'queued')) return 'En cola'
  if (workItem.automation_tasks?.some((task) => task.status === 'cancelled')) return 'Ejecución cancelada'
  return 'Preparando'
}

function clientWorkItems(client: DeliveryClientOverview, projects: DeliveryProject[]) {
  return projects
    .filter((project) => project.client_id === client.client.id || project.client?.id === client.client.id)
    .flatMap((project) => project.work_items?.map(asClientFlowWorkItem) ?? [])
    .sort((left, right) => safeTime(right.updated_at) - safeTime(left.updated_at))
}

function clientTone(row: ClientRow): FlowTone {
  if (row.executionAttentionCount > 0) return 'attention'
  if (row.attentionCount > 0) return 'decision'
  if (row.activeCount > 0) return 'active'
  if (row.flowCount > 0 && row.workItems.length > 0 && row.workItems.every((workItem) => workItem.state === 'released')) return 'complete'
  return 'waiting'
}

function FlowPulse({ tone }: { tone: FlowTone }) {
  const colors = {
    attention: 'border-rose-300 bg-rose-500 shadow-[0_0_0_4px_rgb(244_63_94_/_12%)]',
    decision: 'border-amber-300 bg-amber-400 shadow-[0_0_0_4px_rgb(251_191_36_/_12%)]',
    active: 'border-sky-300 bg-sky-500 shadow-[0_0_0_4px_rgb(14_165_233_/_12%)]',
    complete: 'border-emerald-300 bg-emerald-500',
    waiting: 'border-border-subtle bg-surface-soft',
  } as const
  const activeIndex = tone === 'complete' ? 3 : tone === 'waiting' ? 0 : tone === 'decision' || tone === 'attention' ? 2 : 1

  const labels: Record<FlowTone, string> = {
    attention: 'Ejecución requiere atención',
    decision: 'Decisión humana pendiente',
    active: 'Agente trabajando',
    complete: 'Flujo terminado',
    waiting: 'Flujo preparando el siguiente paso',
  }
  return (
    <div className="flex min-w-38 items-center gap-1.5" role="img" aria-label={labels[tone]}>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full border transition-all duration-500 motion-reduce:transition-none ${index <= activeIndex ? colors[tone] : colors.waiting} ${index === activeIndex && tone === 'active' ? 'animate-pulse motion-reduce:animate-none' : ''}`} />
          {index < 3 && <span className={`h-px w-5 sm:w-7 ${index < activeIndex ? 'bg-border-strong' : 'bg-border-subtle'}`} />}
        </div>
      ))}
    </div>
  )
}

function flowStageIndex(tone: FlowTone) {
  if (tone === 'complete') return 3
  if (tone === 'attention' || tone === 'decision') return 2
  if (tone === 'active') return 1
  return 0
}

function Metric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border px-3 py-2.5 ${emphasis ? 'border-(--tenant-accent)/25 bg-(--tenant-accent)/[.055]' : 'border-border-subtle bg-surface-soft/70'}`}>
      <p className="text-base font-semibold tabular-nums text-ink sm:text-lg">{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold tracking-[0.08em] text-ink-muted uppercase sm:text-[11px]">{label}</p>
    </div>
  )
}

export default function DeliveryClientsPage() {
  const deliveryClients = useSWR<DeliveryClientOverview[]>(deliveryClientsPath(), fetcher, {
    refreshInterval: 15_000,
    dedupingInterval: 5_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const portfolioQuery = useSWR<DeliveryPortfolioSnapshot | null>(
    automationPortfolioPath(),
    async (path) => normalizeDeliveryPortfolio(await fetcher(path)),
    { refreshInterval: deliveryPortfolioRefreshInterval, dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const needsProjectRecovery = Boolean(portfolioQuery.error || (!portfolioQuery.data && !portfolioQuery.isLoading))
  const projectsQuery = useSWR<DeliveryProject[]>(
    needsProjectRecovery ? deliveryProjectsPath() : null,
    fetcher,
    { refreshInterval: 15_000, dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [profileOpen, setProfileOpen] = useState(false)
  const organizationClients = useSWR<ClientsPageResponse>(
    profileOpen ? clientsPagePath({ page: 1, page_size: 100 }) : null,
    fetcher,
    { dedupingInterval: 15_000, keepPreviousData: true }
  )
  const [selectedClientId, setSelectedClientId] = useState('')
  const [health, setHealth] = useState<Health>('healthy')
  const [contacts, setContacts] = useState('')
  const [rules, setRules] = useState('')
  const [conversationSummary, setConversationSummary] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const items = useMemo(() => deliveryClients.data ?? [], [deliveryClients.data])
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const portfolioSnapshot = portfolioQuery.data ?? null
  const selectableClients = useMemo(() => organizationClients.data?.data ?? [], [organizationClients.data])
  const clientRows = useMemo<ClientRow[]>(() => {
    const knownClients = new Map(items.map((client) => [client.client.id, client]))
    const compactProjects = portfolioSnapshot?.projects.map(asClientPortfolioProject) ?? []
    const clientIds = new Set([...items.map((client) => client.client.id), ...compactProjects.map((project) => project.client_id)])

    return [...clientIds]
      .map((clientId) => {
        const portfolioProjects = compactProjects
          .filter((project) => project.client_id === clientId)
          .sort((left, right) => safeTime(right.updated_at) - safeTime(left.updated_at))
        const client = knownClients.get(clientId) ?? {
          client: { id: clientId, name: portfolioProjects[0]?.client_name ?? 'Cliente sin nombre' },
          project_count: portfolioProjects.length,
          conversation_count: 0,
        }
        const workItems = portfolioSnapshot
          ? portfolioProjects.flatMap((project) => project.work_items).sort((left, right) => safeTime(right.updated_at) - safeTime(left.updated_at))
          : clientWorkItems(client, projects)
        const flowCount = portfolioSnapshot
          ? portfolioProjects.reduce((total, project) => total + project.work_item_count, 0)
          : workItems.length
        const activeCount = portfolioSnapshot
          ? portfolioProjects.reduce((total, project) => total + project.active_work_items, 0)
          : workItems.filter(isActive).length
        const attentionCount = portfolioSnapshot
          ? portfolioProjects.reduce((total, project) => total + project.decisions_required + project.blocked_work_items + project.attention_tasks, 0)
          : workItems.filter(requiresHuman).length
        const executionAttentionCount = portfolioSnapshot
          ? portfolioProjects.reduce((total, project) => total + project.attention_tasks + project.blocked_work_items, 0)
          : workItems.filter((workItem) => workItemTone(workItem) === 'attention').length

        return { client, projects: portfolioProjects, workItems, flowCount, activeCount, attentionCount, executionAttentionCount }
      })
      .sort((left, right) => {
        const attention = right.attentionCount - left.attentionCount
        if (attention) return attention
        const active = right.activeCount - left.activeCount
        return active || left.client.client.name.localeCompare(right.client.client.name)
      })
  }, [items, portfolioSnapshot, projects])
  const decisions = useMemo(
    () =>
      clientRows
        .flatMap(({ client, workItems }) => workItems.filter(requiresHuman).map((workItem) => ({ client, workItem })))
        .sort((left, right) => safeTime(right.workItem.updated_at) - safeTime(left.workItem.updated_at)),
    [clientRows]
  )
  const visibleDecisions = decisions.slice(0, 3)
  const activeFlows = useMemo(() => clientRows.reduce((total, row) => total + row.activeCount, 0), [clientRows])
  const decisionTotal = useMemo(() => clientRows.reduce((total, row) => total + row.attentionCount, 0), [clientRows])
  const hiddenAttentionCount = Math.max(0, decisionTotal - visibleDecisions.length)
  const firstUnlistedAttentionProject = useMemo(
    () => clientRows.flatMap((row) => row.projects).find((project) => project.decisions_required + project.blocked_work_items + project.attention_tasks > 0),
    [clientRows]
  )
  const filteredRows = useMemo(
    () =>
      clientRows.filter((row) => {
        if (filter === 'active') return row.activeCount > 0
        if (filter === 'attention') return row.client.profile?.health === 'at_risk' || row.attentionCount > 0
        return true
      }),
    [clientRows, filter]
  )

  function selectClient(id: string) {
    const item = items.find((candidate) => candidate.client.id === id)
    setSelectedClientId(id)
    setHealth(item?.profile?.health ?? 'healthy')
    setContacts(jsonLines(item?.profile?.contacts).join('\n'))
    setRules(jsonLines(item?.profile?.rules).join('\n'))
    setConversationSummary(item?.profile?.conversation_summary ?? '')
    setMessage('')
  }

  function openProfile(id?: string) {
    if (id) selectClient(id)
    else {
      setSelectedClientId('')
      setHealth('healthy')
      setContacts('')
      setRules('')
      setConversationSummary('')
      setMessage('')
    }
    setRulesOpen(false)
    setHandoffOpen(false)
    setProfileOpen(true)
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!selectedClientId) return
    setSaving(true)
    setMessage('')
    try {
      await api.put(deliveryClientProfilePath(selectedClientId), {
        health,
        contacts: lines(contacts),
        rules: lines(rules),
        conversation_summary: conversationSummary.trim(),
      })
      setMessage('Contexto actualizado. El siguiente flujo lo tomará al iniciar.')
      await deliveryClients.mutate()
    } catch {
      setMessage('No se pudo guardar el contexto. Esta acción requiere administración global de ITBEM.')
    } finally {
      setSaving(false)
    }
  }

  const isLoading = !portfolioSnapshot && (deliveryClients.isLoading || (needsProjectRecovery && projectsQuery.isLoading))
  const hasLoadError = !portfolioSnapshot && Boolean(deliveryClients.error || (needsProjectRecovery && projectsQuery.error))
  const portfolioSessionRecoveryMessage =
    localSessionRecoveryMessage(portfolioQuery.error) ??
    localSessionRecoveryMessage(deliveryClients.error) ??
    localSessionRecoveryMessage(projectsQuery.error)
  const isRefreshingSignals = deliveryClients.isValidating || portfolioQuery.isValidating || projectsQuery.isValidating
  const signalTone = hasLoadError ? 'bg-amber-500' : isRefreshingSignals ? 'bg-sky-500' : 'bg-emerald-500'
  const signalLabel = hasLoadError ? 'Pendiente de sincronizar' : isRefreshingSignals ? 'Actualizando señal' : 'Señal actualizada'
  const noOrganizations = !organizationClients.isLoading && !organizationClients.error && selectableClients.length === 0

  function refreshSignals() {
    void deliveryClients.mutate()
    void portfolioQuery.mutate()
    if (needsProjectRecovery) void projectsQuery.mutate()
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-[1440px] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
        <header className="flex flex-col gap-5 border-b border-border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {!hasLoadError ? (
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
                <span className="relative flex size-2" aria-hidden="true"><span className={`absolute inline-flex size-full rounded-full opacity-50 ${isRefreshingSignals ? 'animate-ping motion-reduce:animate-none bg-sky-400' : ''}`} /><span className={`relative inline-flex size-2 rounded-full ${signalTone}`} /></span>
                {signalLabel}
              </div>
            ) : null}
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">Portafolio en movimiento</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">El contexto se incorpora automáticamente en cada flujo.</p>
          </div>
          {!hasLoadError && <Button color="indigo" onClick={() => openProfile()}><PlusIcon data-slot="icon" />Gestionar contexto</Button>}
        </header>

        {!hasLoadError && <section aria-label="Pulso del portafolio" className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
          <Metric label="En movimiento" value={activeFlows} emphasis />
          <Metric label={decisionTotal > 0 ? 'Requiere atención' : 'Sin intervención'} value={decisionTotal} />
        </section>}

        <div className={`mt-5 grid gap-5 ${hasLoadError ? '' : 'xl:grid-cols-[minmax(0,1fr)_20rem]'}`}>
          <section className="premium-surface overflow-hidden rounded-3xl">
            <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">Señales por cliente</h2>
              </div>
              {!hasLoadError && <div className="flex items-center gap-1 rounded-xl bg-surface-soft p-1" role="group" aria-label="Filtrar clientes">
                {([
                  ['all', 'Todos'],
                  ['active', 'En curso'],
                  ['attention', 'Atención'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-11 rounded-lg px-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35 ${filter === value ? 'bg-[var(--app-surface-raised)] text-ink shadow-sm ring-1 ring-border-subtle' : 'text-ink-muted hover:text-ink'}`}>{label}</button>
                ))}
              </div>}
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando señales de clientes">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex min-h-28 gap-3 rounded-2xl border border-border-subtle bg-surface-soft/65 p-3.5 motion-reduce:animate-none">
                    <span className="size-10 shrink-0 animate-pulse rounded-2xl bg-surface-interactive motion-reduce:animate-none" />
                    <span className="min-w-0 flex-1">
                      <span className="block h-3 w-32 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                      <span className="mt-3 block h-2.5 w-48 max-w-full animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                      <span className="mt-3 block h-10 w-full animate-pulse rounded-xl bg-surface-interactive motion-reduce:animate-none" />
                    </span>
                  </div>
                ))}
              </div>
            ) : hasLoadError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 p-4 sm:p-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ExclamationTriangleIcon className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{portfolioSessionRecoveryMessage ? 'La sesión local necesita atención' : 'No pudimos actualizar las señales'}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{portfolioSessionRecoveryMessage ?? 'Tu contexto no cambió. Vuelve a sincronizar para recuperar el pulso del agente.'}</p></div><Button outline className="w-full sm:w-auto" onClick={refreshSignals}><ArrowPathIcon data-slot="icon" />{portfolioSessionRecoveryMessage ? 'Actualizar sesión' : 'Reintentar'}</Button></div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center"><CheckCircleIcon className="mx-auto size-7 text-emerald-500" /><p className="mt-3 text-sm font-semibold text-ink">Sin clientes en este estado</p><p className="mt-1 text-sm text-ink-muted">Los flujos autónomos volverán aquí cuando cambien.</p></div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {filteredRows.map((row) => {
                  const { client, workItems } = row
                  const profile = client.profile
                  const meta = healthMeta[profile?.health ?? 'healthy']
                  // A recent completed run should not hide the flow currently
                  // moving or waiting on a person. Surface the next relevant
                  // signal first, then fall back to the latest history item.
                  const current = workItems.find(requiresHuman) ?? workItems.find(isStopping) ?? workItems.find(isActive) ?? workItems[0]
                  const currentIsActive = Boolean(current && isActive(current))
                  const currentIsStopping = Boolean(current && isStopping(current))
                  const currentProject = row.projects[0]
                  const decisionsCount = row.attentionCount
                  const activeCount = row.activeCount
                  const flowTone = clientTone(row)
                  const activeStageIndex = flowStageIndex(flowTone)
                  return (
                    <li key={client.client.id} className="group p-4 transition-colors hover:bg-surface-soft/55 sm:p-5">
                      <div className="flex gap-3 sm:gap-4">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-xs font-bold text-(--tenant-accent)">{initials(client.client.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-ink">{client.client.name}</h3>{row.executionAttentionCount > 0 ? <Badge color="rose">Atención operativa</Badge> : decisionsCount > 0 ? <Badge color="amber">Decisión pendiente</Badge> : <Badge color={meta.color}>{meta.label}</Badge>}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {decisionsCount > 0 && <span className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-amber-500/10 px-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><ExclamationTriangleIcon className="size-3.5" />{decisionsCount}</span>}
                              <Button plain aria-label={`Gestionar contexto de ${client.client.name}`} onClick={() => openProfile(client.client.id)}><ChevronRightIcon data-slot="icon" /></Button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-[var(--app-surface-raised)] px-3 py-2.5">
                            <div className="min-w-0"><p className="text-sm font-medium text-ink">{current ? currentIsActive ? 'Flujo en marcha' : currentIsStopping ? 'Cierre en curso' : requiresHuman(current) ? 'Siguiente intervención' : 'Último flujo' : activeCount ? `${activeCount} flujo${activeCount === 1 ? '' : 's'} en movimiento` : row.flowCount ? `${row.flowCount} flujo${row.flowCount === 1 ? '' : 's'} monitorizado${row.flowCount === 1 ? '' : 's'}` : 'Contexto listo para el próximo flujo'}</p><p className="mt-0.5 text-xs text-ink-muted">{current ? `${workItemLabel(current)} · ${relativeTime(current.updated_at)}` : currentProject ? `Actualizado · ${relativeTime(currentProject.updated_at)}` : `${client.conversation_count} conversación${client.conversation_count === 1 ? '' : 'es'} disponible${client.conversation_count === 1 ? '' : 's'}`}</p></div>
                            <FlowPulse tone={flowTone} />
                          </div>

                          <div className="mt-2.5 flex items-center gap-1.5" aria-label={`Progreso del cliente: etapa ${activeStageIndex + 1} de 4`}>
                            {[0, 1, 2, 3].map((stage) => (
                              <span key={stage} className="flex min-w-0 flex-1 items-center gap-1">
                                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${stage < activeStageIndex ? 'border-emerald-500 bg-emerald-500 text-white' : stage === activeStageIndex ? 'border-(--tenant-accent) bg-(--tenant-accent) text-white' : 'border-border-subtle bg-surface-soft text-ink-muted'}`}>{stage < activeStageIndex ? '✓' : stage + 1}</span>
                                {stage < 3 ? <span className={`h-px min-w-1 flex-1 ${stage < activeStageIndex ? 'bg-emerald-500/45' : 'bg-border-subtle'}`} /> : null}
                              </span>
                            ))}
                          </div>

                          <div className="mt-2 flex items-center justify-end text-xs text-ink-muted">
                            {current ? <Link href={`/automation/work-items/${current.id}?view=${requiresHuman(current) ? 'control' : 'overview'}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-(--tenant-accent) transition hover:opacity-75">{requiresHuman(current) ? 'Abrir gate' : currentIsStopping ? 'Ver cierre' : currentIsActive ? 'Ver flujo' : 'Ver resultado'}<ArrowTopRightOnSquareIcon className="size-3.5" /></Link> : currentProject ? <Link href={`/automation/projects/${currentProject.id}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-(--tenant-accent) transition hover:opacity-75">Ver resultado<ArrowTopRightOnSquareIcon className="size-3.5" /></Link> : <button type="button" onClick={() => openProfile(client.client.id)} className="inline-flex min-h-11 items-center font-semibold text-(--tenant-accent) transition hover:opacity-75">Completar contexto</button>}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {!hasLoadError ? <aside className="premium-surface h-fit overflow-hidden rounded-3xl xl:sticky xl:top-6">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-4">
              <div><p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Intervención</p><h2 className="mt-0.5 font-semibold text-ink">Sólo lo que espera a alguien</h2></div>
              <span className="flex size-8 items-center justify-center rounded-xl bg-amber-500/10 text-xs font-bold text-amber-700 dark:text-amber-300">{decisionTotal}</span>
            </div>
            {isLoading ? <div className="space-y-2 p-4" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando intervenciones"><div className="h-16 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" /><div className="h-16 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" /></div> : hasLoadError ? (
              <div className="p-5"><div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10"><ExclamationTriangleIcon className="size-5 text-amber-600" /></div><p className="mt-3 text-sm font-semibold text-ink">Intervenciones sin confirmar</p><p className="mt-1 text-xs leading-5 text-ink-muted">Sin una lectura actual no podemos asegurar que el agente tenga vía libre.</p></div>
            ) : decisionTotal === 0 ? (
              <div className="p-5"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10"><CheckCircleIcon className="size-5 text-emerald-600" /></div><p className="mt-3 text-sm font-semibold text-ink">El agente tiene vía libre</p><p className="mt-1 text-xs leading-5 text-ink-muted">No hay revisiones ni bloqueos abiertos en los clientes monitorizados.</p></div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {visibleDecisions.map(({ client, workItem }) => <li key={workItem.id} className="p-4"><p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{client.client.name}</p><p className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{workItem.title}</p><div className="mt-2 flex items-center justify-between gap-2"><span className={`text-xs font-medium ${workItemTone(workItem) === 'attention' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>{workItemLabel(workItem)}</span><Link href={`/automation/work-items/${workItem.id}?view=control`} className="inline-flex min-h-11 items-center text-xs font-semibold text-(--tenant-accent)">Abrir gate</Link></div></li>)}
                {hiddenAttentionCount > 0 && firstUnlistedAttentionProject ? <li className="p-4"><p className="text-sm font-semibold text-ink">{hiddenAttentionCount} señal{hiddenAttentionCount === 1 ? '' : 'es'} adicional{hiddenAttentionCount === 1 ? '' : 'es'}</p><p className="mt-1 text-xs leading-5 text-ink-muted">El resumen compacto indica gates o ejecuciones que requieren atención; abre el workspace para ver cada paso.</p><Link href={`/automation/projects/${firstUnlistedAttentionProject.id}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-(--tenant-accent)">Ver señales</Link></li> : null}
              </ul>
            )}
          </aside> : null}
        </div>
      </main>

      <Dialog open={profileOpen} onClose={setProfileOpen} size="2xl">
        <form onSubmit={saveProfile}>
          <DialogTitle>Contexto que el agente puede usar</DialogTitle>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Se congela al iniciar un flujo. Mantén aquí sólo decisiones reutilizables, no credenciales.</p>
          <DialogBody className="space-y-4">
            {noOrganizations && <div className="rounded-2xl border border-dashed border-(--tenant-accent)/35 bg-(--tenant-accent)/[.06] p-4"><p className="text-sm font-semibold text-ink">Primero crea una organización</p><Link href="/clients" className="mt-2 inline-flex text-sm font-semibold text-(--tenant-accent)">Crear organización <ChevronRightIcon className="size-4" /></Link></div>}
            <label className="block text-sm font-medium text-ink">Cliente<select required value={selectedClientId} onChange={(event) => selectClient(event.target.value)} disabled={organizationClients.isLoading || !!organizationClients.error || selectableClients.length === 0} className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"><option value="">{organizationClients.isLoading ? 'Cargando clientes…' : organizationClients.error ? 'No pudimos cargar clientes' : 'Elige un cliente'}</option>{selectableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <fieldset><legend className="text-sm font-medium text-ink">Salud de la relación</legend><div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Salud de la relación">{(Object.entries(healthMeta) as Array<[Health, typeof healthMeta[Health]]>).map(([value, meta]) => <button type="button" key={value} onClick={() => setHealth(value)} aria-pressed={health === value} className={`min-h-11 rounded-xl border px-2 text-xs font-semibold transition ${health === value ? 'border-(--tenant-accent) bg-(--tenant-accent)/10 text-ink ring-1 ring-(--tenant-accent)/20' : 'border-border-subtle bg-surface-soft text-ink-muted hover:border-border-strong'}`}><span className={`mr-1.5 inline-block size-1.5 rounded-full ${meta.dot}`} />{meta.label}</button>)}</div></fieldset>
            <details onToggle={(event) => setRulesOpen(event.currentTarget.open)} className="group rounded-2xl border border-border-subtle bg-surface-soft/50"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)">Reglas y contactos <ChevronRightIcon className="size-4 transition group-open:rotate-90 motion-reduce:transition-none" /></summary>{rulesOpen && <div className="space-y-4 border-t border-border-subtle p-4"><label className="block text-sm font-medium text-ink">Contactos <span className="font-normal text-ink-muted">(uno por línea)</span><textarea value={contacts} onChange={(event) => setContacts(event.target.value)} rows={3} maxLength={12000} placeholder="Nombre · rol · canal" className="mt-2 w-full rounded-xl border border-border-subtle bg-[var(--app-surface-raised)] px-3 py-2 text-sm" /></label><label className="block text-sm font-medium text-ink">Reglas <span className="font-normal text-ink-muted">(una por línea)</span><textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={4} maxLength={12000} placeholder="Ej. Validar la entrega antes de publicar" className="mt-2 w-full rounded-xl border border-border-subtle bg-[var(--app-surface-raised)] px-3 py-2 text-sm" /></label></div>}</details>
            <details onToggle={(event) => setHandoffOpen(event.currentTarget.open)} className="group rounded-2xl border border-border-subtle bg-surface-soft/50"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)">Último handoff <ChevronRightIcon className="size-4 transition group-open:rotate-90 motion-reduce:transition-none" /></summary>{handoffOpen && <div className="border-t border-border-subtle p-4"><label className="block text-sm font-medium text-ink">Qué debe saber el próximo flujo<textarea value={conversationSummary} onChange={(event) => setConversationSummary(event.target.value)} rows={5} maxLength={12000} placeholder="Decisiones recientes y acuerdos vigentes. Sin credenciales." className="mt-2 w-full rounded-xl border border-border-subtle bg-[var(--app-surface-raised)] px-3 py-2 text-sm" /></label></div>}</details>
            {message && <p role="status" className="rounded-xl bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-muted">{message}</p>}
          </DialogBody>
          <DialogActions><Button outline type="button" onClick={() => setProfileOpen(false)}>Cancelar</Button><Button color="indigo" type="submit" disabled={saving || !selectedClientId}><HeartIcon data-slot="icon" />{saving ? 'Guardando…' : 'Guardar contexto'}</Button></DialogActions>
        </form>
      </Dialog>
    </PageTransition>
  )
}
