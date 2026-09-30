'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import type {
  AutomationAgentHistoryItem,
  AutomationAgentHistoryPage,
  AutomationAgentHistoryQueryFilters,
  AutomationAgentInstance,
} from '@/features/automation/agent-directory'
import {
  automationAgentDirectoryPath,
  automationAgentInstanceOperationalView,
  automationAgentPlanStepProtocolState,
  isSafeAutomationEpicId,
  parseAutomationAgentDirectory,
  parseAutomationAgentHistory,
} from '@/features/automation/agent-directory'
import { AgentDirectoryScopeSelectors } from '@/features/automation/agent-directory-screen'
import type { AgentDirectoryProjectOption, AgentDirectoryScopeOption } from '@/features/automation/agent-directory-screen'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { automationAgentHistoryPath, clientPath, deliveryEpicBrowserPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { useStore } from '@/store/useStore'
import type { ScopedFetcherKey } from '@/lib/request-context'
import { useAgentDirectoryStream } from '@/features/automation/use-agent-directory-stream'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CpuChipIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'

const EMPTY_FILTERS: AutomationAgentHistoryQueryFilters = {
  from: '',
  to: '',
  client_id: '',
  project_id: '',
  work_item_id: '',
  operation: '',
  status: '',
  provider: '',
  worker_id: '',
  machine_id: '',
  agent_instance_id: '',
  run_id: '',
}

const STATUS_LABELS: Record<string, string> = {
  working: 'Trabajando',
  available: 'Disponible',
  draining: 'Drenando',
  offline: 'Sin conexión',
  pending: 'Pendiente',
  queued: 'En cola',
  running: 'En curso',
  cancel_requested: 'Cancelación solicitada',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
  ready: 'Lista',
  started: 'Iniciada',
  recorded: 'Registrada',
}

const KIND_LABELS: Record<AutomationAgentHistoryItem['kind'], string> = {
  task: 'Ejecución de tarea',
  task_event: 'Ciclo de vida de tarea',
  inference: 'Inferencia',
  tool_call: 'Llamada a herramienta',
  step_event: 'Evento de paso',
  step_activity: 'Actividad del paso',
}

const ACTION_LABELS: Record<NonNullable<AutomationAgentHistoryItem['activity_action']>, string> = {
  inference: 'Inferencia',
  tool: 'Herramienta',
  file_read: 'Lectura de archivo',
  file_change: 'Cambio de archivo',
  command: 'Comando',
  validation: 'Validación',
  evidence: 'Evidencia',
  activity: 'Actividad',
}

const OPERATION_LABELS: Record<string, string> = {
  'delivery.chat': 'Chat de agente',
  'delivery.plan': 'Planeación',
  'delivery.implementation': 'Implementación',
  'delivery.publish': 'Publicación',
  'delivery.qa': 'Validación',
  'delivery.summary': 'Entrega',
}

function planStepProtocolLabel(protocols: readonly string[] | undefined) {
  const state = automationAgentPlanStepProtocolState(protocols)
  if (state === 'supported') return { color: 'emerald' as const, label: 'Plan steps v1 compatible' }
  if (state === 'legacy') return { color: 'amber' as const, label: 'Legacy · sin soporte de pasos' }
  return { color: 'zinc' as const, label: 'Protocolo no reportado' }
}

const UNSAFE_DETAIL =
  /(?:\b(?:sk|rk|pk|gh[pousr])[-_][a-z0-9_-]{12,}\b|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+\S+|\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*\S+|\b(?:system|developer|user)?\s*(?:prompt|reasoning|thought|chain[ -]of[ -]thought)\s*[:=]|https?:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|test|local|localhost|internal|corp|ai|mx|app|cloud)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|[a-z]:[\\/]|\/(?:home|users|tmp|var|etc|root|workspace|app|mnt|opt|private)\/|\b[\w.-]+(?:\\[\w.-]+)+(?:\.[\w.-]+)?\b|\b[\w.-]+(?:\/[\w.-]+)+(?:\.[\w.-]+)?\b)/i

function safeText(value: string | undefined, fallback = '') {
  const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ') ?? ''
  if (!normalized) return fallback
  if (UNSAFE_DETAIL.test(normalized)) return 'Detalle omitido por seguridad'
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized
}

function number(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value)
}

function money(value?: number) {
  if (value === undefined) return 'No disponible'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value / 1_000_000)
}

function dateTime(value?: string) {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin dato' : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function localDateBoundary(value: string, exclusiveEnd: boolean) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day + (exclusiveEnd ? 1 : 0))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function historyQuery(filters: AutomationAgentHistoryQueryFilters): AutomationAgentHistoryQueryFilters {
  return {
    ...filters,
    from: localDateBoundary(filters.from, false),
    to: localDateBoundary(filters.to, true),
    client_id: filters.client_id.trim(),
    project_id: filters.project_id.trim(),
    work_item_id: filters.work_item_id.trim(),
    operation: filters.operation.trim(),
    status: filters.status.trim(),
    provider: filters.provider.trim(),
    worker_id: filters.worker_id.trim(),
    machine_id: filters.machine_id.trim(),
    agent_instance_id: filters.agent_instance_id.trim(),
    run_id: filters.run_id.trim(),
  }
}

function operationLabel(value?: string) {
  if (!value) return 'Operación no reportada'
  return OPERATION_LABELS[value] ?? 'Operación registrada'
}

function AgentContextHierarchy({
  clientId,
  clientName,
  projectId,
  projectName,
  epicId,
  epicTitle,
  workItemId,
  workItemTitle,
  stepKey,
  label,
}: {
  clientId?: string
  clientName?: string
  projectId?: string
  projectName?: string
  epicId?: string
  epicTitle?: string
  workItemId?: string
  workItemTitle?: string
  stepKey?: string
  label: string
}) {
  const segments: Array<{ key: string; title: string; href?: string }> = []
  if (clientId || clientName) {
    segments.push({ key: 'client', title: safeText(clientName, 'Cliente'), href: clientId ? clientPath(clientId) : undefined })
  }
  if (projectId || projectName) {
    segments.push({
      key: 'project',
      title: safeText(projectName, 'Proyecto'),
      href: projectId ? `/automation/projects/${encodeURIComponent(projectId)}` : undefined,
    })
  }
  if (epicId || epicTitle) {
    segments.push({
      key: 'epic',
      title: safeText(epicTitle, 'Épica'),
      href: isSafeAutomationEpicId(epicId) ? deliveryEpicBrowserPath(epicId) : undefined,
    })
  }
  if (workItemId || workItemTitle) {
    segments.push({
      key: 'work-item',
      title: safeText(workItemTitle, 'Tarea'),
      href: workItemId ? `/automation/work-items/${encodeURIComponent(workItemId)}?view=activity` : undefined,
    })
  }
  if (stepKey) segments.push({ key: 'step', title: `Paso ${safeText(stepKey)}` })
  if (segments.length === 0) return null
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {segments.map((segment, index) => (
        <span key={segment.key} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="text-ink-muted">›</span> : null}
          {segment.href ? (
            <Link
              href={segment.href}
              aria-label={segment.key === 'work-item' ? `Abrir tarea: ${segment.title}` : undefined}
              className="font-semibold text-(--tenant-accent) hover:underline"
            >
              {segment.title}
            </Link>
          ) : (
            <span className="text-ink-secondary">{segment.title}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function ProfileMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p> : null}
    </article>
  )
}

function reportedAgentInstanceId(instance: AutomationAgentInstance) {
  // The current directory response includes this optional field, although the
  // shared frontend type predates it. Keep the read defensive until that
  // shared contract is updated by its owner.
  const value = (instance as AutomationAgentInstance & { agent_instance_id?: unknown }).agent_instance_id
  return typeof value === 'string' ? safeText(value, 'No reportado') : 'No reportado'
}

function InstancePanel({ instance, generatedAt }: { instance: AutomationAgentInstance; generatedAt: string }) {
  const state = automationAgentInstanceOperationalView(instance, generatedAt)
  const protocol = planStepProtocolLabel(instance.protocols)
  const activeRuns = instance.active_runs
  const capacityPercent = state.concurrency > 0
    ? Math.min(100, Math.round((state.reportedActiveRuns / state.concurrency) * 100))
    : 0
  const availableSlots = state.availability === 'unknown' || state.availability === 'offline'
    ? undefined
    : state.effectiveAvailableSlots
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">
            {safeText(instance.machine_id, 'Máquina no reportada')}
          </h3>
          <p className="mt-1 break-all text-xs text-ink-muted">Worker · {safeText(instance.worker_id, 'No disponible')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge color={state.availability === 'available' ? 'emerald' : state.availability === 'offline' ? 'rose' : 'amber'}>
            {STATUS_LABELS[instance.status] ?? 'Estado reportado'}
            {' · '}
            {state.liveness === 'live' ? 'Señal viva' : state.liveness === 'stale' ? 'Señal vencida' : 'Señal no disponible'}
          </Badge>
          <Badge color={protocol.color}>{protocol.label}</Badge>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-ink-muted">Proveedor · modelo</dt><dd className="mt-1 break-words font-medium text-ink">{safeText(instance.provider, 'No disponible')} · {safeText(instance.model, 'No disponible')}</dd></div>
        <div><dt className="text-ink-muted">Worker / instancia</dt><dd className="mt-1 break-all font-medium text-ink">{safeText(instance.worker_id, 'Worker no reportado')}<span className="block text-ink-muted">{reportedAgentInstanceId(instance)}</span></dd></div>
        <div><dt className="text-ink-muted">Último heartbeat</dt><dd className="mt-1 font-medium text-ink">{dateTime(instance.last_seen_at)}</dd></div>
        <div><dt className="text-ink-muted">Inicio reportado</dt><dd className="mt-1 font-medium text-ink">{dateTime(instance.started_at)}</dd></div>
      </dl>
      <div className="mt-4 rounded-xl border border-border-subtle bg-surface-soft/55 p-3" aria-label="Capacidad reportada de la instancia">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-ink">Slots anunciados disponibles</p>
          <p className="text-sm font-semibold tabular-nums text-ink" data-testid="agent-instance-available-slots">
            {availableSlots === undefined ? 'No disponible' : `${number(availableSlots)} de ${number(state.concurrency)}`}
          </p>
        </div>
        {availableSlots !== undefined ? (
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-label="Concurrencia ocupada reportada"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={capacityPercent}
          >
            <div className="h-full rounded-full bg-(--tenant-accent) transition-[width]" style={{ width: `${capacityPercent}%` }} />
          </div>
        ) : null}
        <p className="mt-2 text-[11px] leading-5 text-ink-muted">
          {number(state.reportedActiveRuns)} ocupados / {number(state.concurrency)} configurados. Derivado del heartbeat y la captura; no confirma afinidad ni disponibilidad del workspace.
        </p>
      </div>
      <div className="mt-4 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-ink">Sesiones y trabajo actual asignado</h4>
          <Badge color="zinc">{number(activeRuns.length)}</Badge>
        </div>
        {activeRuns.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {activeRuns.map((run) => (
              <li key={`${run.task_id}:${run.run_id}`} className="rounded-xl border border-border-subtle bg-surface-soft/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{safeText(run.work_item_title, operationLabel(run.operation))}</p>
                    <p className="mt-1 text-xs text-ink-muted">{operationLabel(run.operation)} · {STATUS_LABELS[run.status] ?? 'Estado reportado'}</p>
                  </div>
                  <span className="max-w-full break-all text-xs font-medium text-ink-secondary">Run · {safeText(run.run_id, 'No disponible')}</span>
                </div>
                <div className="mt-2">
                  <AgentContextHierarchy
                    clientId={run.client_id}
                    clientName={run.client_name}
                    projectId={run.project_id}
                    projectName={run.project_name}
                    epicId={run.epic_id}
                    epicTitle={run.epic_title}
                    workItemId={run.work_item_id}
                    workItemTitle={run.work_item_title}
                    stepKey={run.step_key}
                    label="Jerarquía del trabajo actual"
                  />
                  {!run.client_id && !run.client_name && !run.project_id && !run.project_name && !run.epic_id && !run.epic_title && !run.work_item_id && !run.work_item_title && !run.step_key ? (
                    <p className="text-xs text-ink-muted">Contexto jerárquico no reportado</p>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
                  <span>Inicio · {dateTime(run.started_at)}</span>
                  {run.work_item_id ? (
                    <Link href={`/automation/work-items/${encodeURIComponent(run.work_item_id)}`} className="inline-flex min-h-9 items-center gap-1 font-semibold text-(--tenant-accent) hover:underline">
                      Abrir tarea <ArrowTopRightOnSquareIcon className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-border-subtle p-3 text-xs text-ink-muted">Sin sesiones activas reportadas para esta instancia.</p>
        )}
      </div>
    </article>
  )
}

function FilterField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date'
  placeholder?: string
}) {
  return (
    <label className="block text-xs font-semibold text-ink-secondary">
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink placeholder:text-ink-muted"
      />
    </label>
  )
}

function HistoryRow({ item }: { item: AutomationAgentHistoryItem }) {
  const title = item.kind === 'step_activity' && item.activity_action
    ? ACTION_LABELS[item.activity_action]
    : KIND_LABELS[item.kind]
  return (
    <li className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs text-ink-muted">{dateTime(item.occurred_at)} · {operationLabel(item.operation)}</p>
        </div>
        <Badge color={item.status === 'failed' ? 'rose' : item.status === 'completed' ? 'emerald' : 'zinc'}>
          {item.status ? STATUS_LABELS[item.status] ?? 'Estado reportado' : 'Estado no disponible'}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-ink-muted">Proveedor · modelo</dt><dd className="mt-1 break-words font-medium text-ink">{safeText(item.provider, 'No disponible')} · {safeText(item.model, 'No disponible')}</dd></div>
        <div><dt className="text-ink-muted">Tokens entrada / salida</dt><dd className="mt-1 font-medium text-ink tabular-nums">{item.input_tokens === undefined ? 'No disponible' : number(item.input_tokens)} / {item.output_tokens === undefined ? 'No disponible' : number(item.output_tokens)}</dd></div>
        <div><dt className="text-ink-muted">Costo registrado</dt><dd className="mt-1 font-medium text-ink tabular-nums">{money(item.total_cost_microusd)}</dd></div>
        <div><dt className="text-ink-muted">Correlación</dt><dd className="mt-1 break-all font-medium text-ink">{safeText(item.run_id, 'Run no reportado')}</dd></div>
      </dl>
      <div className="mt-3 border-t border-border-subtle pt-3">
        <AgentContextHierarchy
          clientId={item.client_id}
          clientName={item.client_name}
          projectId={item.project_id}
          projectName={item.project_name}
          epicId={item.epic_id}
          epicTitle={item.epic_title}
          workItemId={item.work_item_id}
          workItemTitle={item.work_item_title}
          stepKey={item.step_key}
          label="Jerarquía de la actividad histórica"
        />
        {!item.client_id && !item.client_name && !item.project_id && !item.project_name && !item.epic_id && !item.epic_title && !item.work_item_id && !item.work_item_title && !item.step_key ? (
          <p className="text-xs text-ink-muted">Contexto de cliente, proyecto, épica, tarea y paso no reportado</p>
        ) : null}
      </div>
      {item.work_item_id ? (
        <Link href={`/automation/work-items/${encodeURIComponent(item.work_item_id)}?view=activity`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-(--tenant-accent) hover:underline">
          Abrir historial de la tarea <ArrowTopRightOnSquareIcon className="size-3.5" />
        </Link>
      ) : null}
    </li>
  )
}

export default function AutomationAgentProfilePage() {
  const params = useParams<{ agentKey: string }>()
  const agentKey = typeof params.agentKey === 'string' ? params.agentKey : ''
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspaceMode = useStore((state) => state.workspaceMode)
  const currentClient = useStore((state) => state.currentClient)
  const scopeFetcherKey = useScopedFetcherScope()
  const isOrganization = workspaceMode === 'organization'
  const projectsKey = !isOrganization || currentClient?.id ? scopeFetcherKey(deliveryProjectsPath()) : null
  const visibleProjects = useSWR<DeliveryProject[]>(projectsKey, fetcher, {
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
    keepPreviousData: false,
  })
  const projectsAndClients = useMemo(() => {
    const clientById = new Map<string, string>()
    const projects: AgentDirectoryProjectOption[] = []
    for (const project of Array.isArray(visibleProjects.data) ? visibleProjects.data : []) {
      if (!project.id || !project.client_id) continue
      clientById.set(project.client_id, project.client?.name?.trim() || project.client_id)
      projects.push({ id: project.id, client_id: project.client_id, name: project.name?.trim() || project.id })
    }
    return {
      clients: [...clientById].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'es-MX')) as AgentDirectoryScopeOption[],
      projects: projects.sort((left, right) => left.name.localeCompare(right.name, 'es-MX')),
    }
  }, [visibleProjects.data])
  const projectOptionsReady = visibleProjects.data !== undefined
  const clientValues = searchParams.getAll('client_id')
  const projectValues = searchParams.getAll('project_id')
  const rawClientId = clientValues.length === 1 ? clientValues[0] : ''
  const rawProjectId = projectValues.length === 1 ? projectValues[0] : ''
  const selectedClientId = rawClientId && (!projectOptionsReady || projectsAndClients.clients.some((client) => client.id === rawClientId)) ? rawClientId : ''
  const selectedProject = rawProjectId && projectOptionsReady
    ? projectsAndClients.projects.find((project) => project.id === rawProjectId && project.client_id === selectedClientId)
    : undefined
  const selectedProjectId = selectedProject?.id ?? ''
  const invalidScope = projectOptionsReady && (
    clientValues.length > 1 || projectValues.length > 1 || (rawClientId !== '' && !selectedClientId) || (rawProjectId !== '' && !selectedProjectId)
  )
  const directoryScopeReady = (!isOrganization || Boolean(selectedClientId)) && !invalidScope && !((selectedClientId || rawProjectId) && !projectOptionsReady)
  const directoryPath = agentKey && directoryScopeReady
    ? scopeFetcherKey(automationAgentDirectoryPath({ client_id: selectedClientId, project_id: selectedProjectId }))
    : null
  const directory = useSWR(
    directoryPath,
    async (path) => parseAutomationAgentDirectory(await fetcher<unknown>(path)),
    { refreshInterval: 30_000, dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: false },
  )
  const agent = directory.data?.agents.find((profile) => profile.agent_key === agentKey)
  const [draftFilters, setDraftFilters] = useState<AutomationAgentHistoryQueryFilters>({ ...EMPTY_FILTERS })
  const [appliedFilters, setAppliedFilters] = useState<AutomationAgentHistoryQueryFilters>({ ...EMPTY_FILTERS })
  const effectiveAppliedFilters = useMemo(() => ({
    ...appliedFilters,
    client_id: selectedClientId || appliedFilters.client_id,
    project_id: selectedProjectId || appliedFilters.project_id,
  }), [appliedFilters, selectedClientId, selectedProjectId])
  const invalidRange = Boolean(draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to)
  const history = useSWRInfinite<AutomationAgentHistoryPage>(
    (index, previousPage) => {
      if (!agent || !directoryScopeReady) return null
      if (index > 0 && (!previousPage?.has_more || !previousPage.next_cursor)) return null
      return scopeFetcherKey(automationAgentHistoryPath(agent.agent_key, {
        limit: 50, cursor: index > 0 ? previousPage?.next_cursor : undefined, ...effectiveAppliedFilters,
      }))
    },
    async (path) => {
      const page = parseAutomationAgentHistory(await fetcher<unknown>(path as ScopedFetcherKey))
      if (page.agent_key !== agentKey) throw new Error('El historial recibido no corresponde al perfil solicitado.')
      return page
    },
    {
      initialSize: 1,
      persistSize: false,
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
    },
  )
  const setHistorySize = history.setSize
  const items = useMemo(() => history.data?.flatMap((page) => page.items) ?? [], [history.data])
  const lastPage = history.data?.at(-1)
  const canLoadMore = Boolean(lastPage?.has_more && lastPage.next_cursor)
  const selectedHistoryFirstPageKey = agent
    ? scopeFetcherKey(automationAgentHistoryPath(agent.agent_key, { limit: 50, ...effectiveAppliedFilters }))
    : null
  const mutateDirectory = directory.mutate
  const mutateHistory = history.mutate
  const revalidateDirectory = useCallback(() => {
    void mutateDirectory()
  }, [mutateDirectory])
  const revalidateVisibleHistoryFirstPage = useCallback(() => {
    if (!selectedHistoryFirstPageKey) return
    void mutateHistory(undefined, {
      revalidate: (_page, key) => JSON.stringify(key) === JSON.stringify(selectedHistoryFirstPageKey),
    })
  }, [mutateHistory, selectedHistoryFirstPageKey])
  const revalidateLiveSnapshot = useCallback(() => {
    revalidateDirectory()
    revalidateVisibleHistoryFirstPage()
  }, [revalidateDirectory, revalidateVisibleHistoryFirstPage])
  const { status: streamStatus } = useAgentDirectoryStream({
    enabled: workspaceMode === 'platform' && Boolean(directoryPath),
    onSnapshot: revalidateLiveSnapshot,
    onUpdate: revalidateLiveSnapshot,
  })

  const updateScope = useCallback((clientId: string, projectId: string) => {
    if (isOrganization && !clientId) return
    if (clientId && !projectsAndClients.clients.some((client) => client.id === clientId)) return
    if (projectId && !projectsAndClients.projects.some((project) => project.id === projectId && project.client_id === clientId)) return
    const nextParams = new URLSearchParams(searchParams.toString())
    if (clientId) nextParams.set('client_id', clientId)
    else nextParams.delete('client_id')
    if (projectId) nextParams.set('project_id', projectId)
    else nextParams.delete('project_id')
    const query = nextParams.toString()
    router.replace(`${pathname}${query ? `?${query}` : ''}${window.location.hash}`, { scroll: false })
  }, [isOrganization, pathname, projectsAndClients.clients, projectsAndClients.projects, router, searchParams])

  useEffect(() => {
    if (invalidScope) updateScope('', '')
  }, [invalidScope, updateScope])

  useEffect(() => {
    const next = { ...EMPTY_FILTERS, client_id: selectedClientId, project_id: selectedProjectId }
    setDraftFilters(next)
    setAppliedFilters(next)
    void setHistorySize(1)
  }, [selectedClientId, selectedProjectId, setHistorySize])

  const teamHref = useMemo(() => {
    const query = new URLSearchParams()
    if (selectedClientId) query.set('client_id', selectedClientId)
    if (selectedProjectId) query.set('project_id', selectedProjectId)
    const suffix = query.toString()
    return `/automation/agents${suffix ? `?${suffix}` : ''}`
  }, [selectedClientId, selectedProjectId])

  if (!agentKey) {
    return <ProfileLoadState title="Clave de agente no válida" detail="La ruta no contiene una clave de perfil válida." />
  }
  if (!directoryPath) {
    return (
      <PageTransition>
        <main className="mx-auto max-w-[92rem] px-4 py-6 pb-16 sm:px-6 sm:py-9">
          <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-ink-muted">
            <Link href="/automation" className="hover:text-(--tenant-accent)">Operaciones</Link><span aria-hidden="true">/</span>
            <Link href={teamHref} className="hover:text-(--tenant-accent)">Agentes</Link><span aria-hidden="true">/</span>
            <span aria-current="page">Perfil</span>
          </nav>
          <PageHeader
            eyebrow="Contribuidor digital · Perfil individual"
            title="Selecciona el alcance del perfil"
            description="En el espacio de una organización, el directorio solo se consulta después de elegir una empresa o proyecto visible."
            icon={UserGroupIcon}
          />
          <div className="mt-5 max-w-3xl space-y-3">
            <AgentDirectoryScopeSelectors
              clientId={selectedClientId}
              projectId={selectedProjectId}
              clients={projectsAndClients.clients}
              projects={projectsAndClients.projects}
              allowAllClients={workspaceMode === 'platform'}
              disabled={visibleProjects.isLoading || !currentClient && isOrganization}
              onChange={updateScope}
            />
            {visibleProjects.error ? (
              <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-ink-secondary">
                No pudimos cargar la lista de proyectos autorizados. El directorio de agentes no se consultó.
                <Button outline className="ml-3" onClick={() => void visibleProjects.mutate()}>Reintentar</Button>
              </div>
            ) : visibleProjects.isLoading ? (
              <p role="status" className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted">Cargando proyectos visibles…</p>
            ) : (
              <p role="status" className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted">
                Selecciona un alcance visible para cargar el perfil y su historial. La autorización final siempre se verifica en el servidor.
              </p>
            )}
          </div>
        </main>
      </PageTransition>
    )
  }
  if (!directory.data) {
    if (directory.error) return <ProfileLoadState title="No se pudo cargar el perfil" detail="El directorio de agentes no está disponible. Vuelve a intentarlo." onRetry={() => void directory.mutate()} />
    return <ProfileLoadState title="Cargando perfil…" detail="Consultando el directorio autorizado de agentes." loading />
  }
  if (!agent) {
    return <ProfileLoadState title="Perfil no encontrado" detail="No hay un perfil visible para esta clave en el directorio autorizado." />
  }

  const statusColor = agent.status === 'working' ? 'indigo' : agent.status === 'available' ? 'emerald' : agent.status === 'draining' ? 'amber' : 'zinc'
  const configurationColor = agent.active === undefined ? 'zinc' : agent.active ? 'emerald' : 'rose'
  const invalidHistoryRange = Boolean(appliedFilters.from && appliedFilters.to && appliedFilters.from > appliedFilters.to)

  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-16 sm:px-6 sm:py-9">
        <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-ink-muted">
          <Link href="/automation" className="hover:text-(--tenant-accent)">Operaciones</Link><span aria-hidden="true">/</span>
          <Link href="/automation/agents" className="hover:text-(--tenant-accent)">Agentes</Link><span aria-hidden="true">/</span>
          <span aria-current="page" className="truncate text-ink-secondary">{safeText(agent.name, 'Perfil')}</span>
        </nav>
        <PageHeader
          eyebrow="Contribuidor digital · Perfil individual"
          title={safeText(agent.name, 'Agente')}
          description={`${safeText(agent.specialty, 'Especialidad no reportada')} · ${safeText(agent.agent_key, 'Clave no disponible')}`}
          icon={UserGroupIcon}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button outline href={teamHref}><ArrowLeftIcon data-slot="icon" />Equipo</Button>
              <Button outline onClick={() => void directory.mutate()} aria-label="Actualizar perfil de agente"><ArrowPathIcon data-slot="icon" className={directory.isValidating ? 'animate-spin motion-reduce:animate-none' : ''} />Actualizar</Button>
            </div>
          }
        />

        <div className="mt-5 max-w-3xl">
          <AgentDirectoryScopeSelectors
            clientId={selectedClientId}
            projectId={selectedProjectId}
            clients={projectsAndClients.clients}
            projects={projectsAndClients.projects}
            allowAllClients={workspaceMode === 'platform'}
            onChange={updateScope}
          />
        </div>

        {directory.isValidating ? <p className="mt-2 text-right text-[11px] text-ink-muted" role="status">Actualizando snapshot del perfil…</p> : null}
        <p className="mt-1 text-right text-[11px] text-ink-muted" aria-live="polite">
          {streamStatus === 'live'
            ? 'Actualización en vivo activa · respaldo cada 30 s'
            : streamStatus === 'connecting' || streamStatus === 'reconnecting'
              ? 'Conectando actualizaciones en vivo · respaldo cada 30 s'
              : streamStatus === 'offline'
                ? 'Sin conexión en vivo · se reintentará; respaldo cada 30 s'
                : streamStatus === 'error'
                  ? 'Señal en vivo no disponible · respaldo cada 30 s'
                  : null}
        </p>
        {agent.description ? <p className="mt-4 max-w-4xl text-sm leading-6 text-ink-secondary">{safeText(agent.description, 'Descripción omitida por seguridad')}</p> : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de actividad del agente">
          <ProfileMetric label="Estado actual" value={STATUS_LABELS[agent.status] ?? 'No disponible'} detail="Reportado por la captura del directorio" />
          <ProfileMetric label="Ejecuciones activas" value={number(agent.active_run_count)} detail="Agregado reportado por el backend" />
          <ProfileMetric label="Ejecuciones · 30 días" value={number(agent.total_runs_30d)} detail="Agregado reportado por el backend" />
          <ProfileMetric label="Gasto · 30 días" value={money(agent.spend_30d_microusd)} detail="Costo agregado reportado por el backend" />
        </section>

        <section className="mt-7 rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5" aria-labelledby="agent-specialty-title">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><CpuChipIcon className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="agent-specialty-title" className="text-sm font-semibold text-ink">Especialidad y alcance reportado</h2>
                  <p className="mt-1 text-xs text-ink-muted">Configuración del perfil y estado operativo son señales distintas.</p>
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Estado de configuración y estado operativo">
                  <Badge color={configurationColor}>
                    {agent.active === undefined ? 'Configuración no reportada' : agent.active ? 'Configuración · Activo' : 'Configuración · Inactivo'}
                  </Badge>
                  <Badge color={statusColor}>Operativo · {STATUS_LABELS[agent.status] ?? 'No disponible'}</Badge>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-ink">Especialidad · {safeText(agent.specialty, 'No reportada')}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section aria-label="Capacidades declaradas">
                  <h3 className="text-xs font-semibold text-ink-secondary">Capacidades declaradas</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agent.capabilities.map((capability, index) => <Badge key={`${index}:${capability}`} color="zinc">{safeText(capability, 'Capacidad omitida')}</Badge>)}
                    {agent.capabilities.length === 0 ? <span className="text-xs text-ink-muted">No hay capacidades declaradas.</span> : null}
                  </div>
                </section>
                <section aria-label="Operaciones de routing configuradas">
                  <h3 className="text-xs font-semibold text-ink-secondary">Operaciones de routing permitidas</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agent.operations?.map((operation, index) => <Badge key={`${index}:${operation}`} color="indigo">{safeText(operation, 'Operación omitida')}</Badge>)}
                    {agent.operations === undefined ? <span className="text-xs text-ink-muted">No reportadas por la versión anterior de la API.</span> : null}
                    {agent.operations?.length === 0 ? <span className="text-xs text-ink-muted">No hay operaciones de routing configuradas.</span> : null}
                  </div>
                </section>
              </div>
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[.04] p-3">
                <p className="text-xs font-semibold text-ink">Permisos efectivos</p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">Este contrato no publica las políticas de autorización efectivas. Ni capacidades ni operaciones de routing equivalen a permisos efectivos.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="agent-instances-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Equipos locales</p><h2 id="agent-instances-title" className="mt-1 text-xl font-semibold tracking-tight text-ink">Máquinas, instancias y sesiones</h2><p className="mt-1 text-xs text-ink-muted">Captura {dateTime(directory.data.generated_at)} · las sesiones reflejan lo que reporta cada instancia.</p></div>
            <Badge color="zinc">{number(agent.instances.length)} {agent.instances.length === 1 ? 'instancia' : 'instancias'}</Badge>
          </div>
          {agent.instances.length > 0 ? <div className="mt-3 grid gap-3">{agent.instances.map((instance) => <InstancePanel key={instance.worker_id} instance={instance} generatedAt={directory.data!.generated_at} />)}</div> : <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-6 text-sm text-ink-muted">No hay instancias reportadas en la captura actual.</p>}
          {agent.active_run_count > agent.instances.reduce((total, instance) => total + instance.active_runs.length, 0) ? <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[.05] p-3 text-xs leading-5 text-ink-secondary">El backend reporta ejecuciones activas sin detalle de sesión en esta captura; no se atribuyen a una máquina.</p> : null}
        </section>

        <section className="mt-8" aria-labelledby="agent-history-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Trazabilidad consultable</p><h2 id="agent-history-title" className="mt-1 text-xl font-semibold tracking-tight text-ink">Historial del agente</h2><p className="mt-1 text-xs text-ink-muted">Cursor del servidor, filtros por contexto y correlación con worker/run. Prompts, salidas y razonamiento privado no se presentan.</p></div>
            <Badge color="zinc">{items.length ? `${number(items.length)} eventos cargados` : 'Eventos no disponibles aún'}</Badge>
          </div>
          <form
            className="mt-3 grid gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (invalidRange) return
              const next = historyQuery(draftFilters)
              setAppliedFilters({
                ...next,
                client_id: selectedClientId || next.client_id,
                project_id: selectedProjectId || next.project_id,
              })
              void setHistorySize(1)
            }}
          >
            <FilterField label="Desde" type="date" value={draftFilters.from} onChange={(value) => setDraftFilters((current) => ({ ...current, from: value }))} />
            <FilterField label="Hasta" type="date" value={draftFilters.to} onChange={(value) => setDraftFilters((current) => ({ ...current, to: value }))} />
            {!selectedClientId ? <FilterField label="Cliente ID" value={draftFilters.client_id} onChange={(value) => setDraftFilters((current) => ({ ...current, client_id: value }))} /> : null}
            {!selectedProjectId && !selectedClientId ? <FilterField label="Proyecto ID" value={draftFilters.project_id} onChange={(value) => setDraftFilters((current) => ({ ...current, project_id: value }))} /> : null}
            <FilterField label="Tarea ID" value={draftFilters.work_item_id} onChange={(value) => setDraftFilters((current) => ({ ...current, work_item_id: value }))} />
            <FilterField label="Operación" value={draftFilters.operation} placeholder="delivery.implementation" onChange={(value) => setDraftFilters((current) => ({ ...current, operation: value }))} />
            <FilterField label="Estado" value={draftFilters.status} placeholder="completed" onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))} />
            <FilterField label="Proveedor" value={draftFilters.provider} placeholder="openrouter" onChange={(value) => setDraftFilters((current) => ({ ...current, provider: value }))} />
            <FilterField label="Worker ID" value={draftFilters.worker_id} onChange={(value) => setDraftFilters((current) => ({ ...current, worker_id: value }))} />
            <FilterField label="Máquina ID" value={draftFilters.machine_id} onChange={(value) => setDraftFilters((current) => ({ ...current, machine_id: value }))} />
            <FilterField label="Instancia ID" value={draftFilters.agent_instance_id} onChange={(value) => setDraftFilters((current) => ({ ...current, agent_instance_id: value }))} />
            <FilterField label="Run ID" value={draftFilters.run_id} onChange={(value) => setDraftFilters((current) => ({ ...current, run_id: value }))} />
            {invalidRange || invalidHistoryRange ? <p className="text-xs text-rose-700 sm:col-span-2 xl:col-span-4" role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <Button outline type="submit" disabled={invalidRange}>Aplicar filtros</Button>
              <Button plain type="button" onClick={() => {
                const next = { ...EMPTY_FILTERS, client_id: selectedClientId, project_id: selectedProjectId }
                setDraftFilters(next)
                setAppliedFilters(next)
                void setHistorySize(1)
              }}>Limpiar filtros</Button>
              {history.isValidating && items.length > 0 ? <span className="self-center text-xs text-ink-muted" role="status">Actualizando historial…</span> : null}
            </div>
          </form>
          {history.error && items.length === 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4" role="alert"><p className="text-sm text-ink-secondary">No se pudo cargar el historial de este agente.</p><Button outline onClick={() => void history.mutate()}>Reintentar</Button></div>
          ) : history.isLoading && items.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted" role="status" aria-live="polite">Cargando historial…</p>
          ) : items.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">No hay eventos para este perfil y filtros. Cero resultados no significa costo cero; el agregado de 30 días se muestra arriba.</p>
          ) : (
            <>
              {history.error ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3" role="alert"><p className="text-xs text-ink-secondary">No se pudo actualizar el historial; conservamos los eventos ya cargados.</p><Button plain onClick={() => void history.mutate()}>Reintentar</Button></div> : null}
              <ul className="mt-3 space-y-2">{items.map((item) => <HistoryRow key={`${item.kind}:${item.id}`} item={item} />)}</ul>
              {canLoadMore ? <div className="mt-4 flex justify-center"><Button outline onClick={() => void setHistorySize(history.size + 1)} disabled={history.isValidating}>{history.isValidating ? 'Cargando…' : 'Cargar más'}</Button></div> : null}
            </>
          )}
        </section>
      </main>
    </PageTransition>
  )
}

function ProfileLoadState({ title, detail, loading = false, onRetry }: { title: string; detail: string; loading?: boolean; onRetry?: () => void }) {
  return (
    <PageTransition>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><UserGroupIcon className="size-5" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
          {loading ? <p className="mt-3 text-sm text-ink-muted" role="status">Cargando…</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {onRetry ? <Button outline onClick={onRetry}>Reintentar</Button> : null}
            <Button outline href="/automation/agents"><ArrowLeftIcon data-slot="icon" />Volver al equipo</Button>
          </div>
        </div>
      </main>
    </PageTransition>
  )
}
