'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import {
  automationAgentDirectoryPath,
  automationAgentInstanceOperationalView,
  automationAgentPlanStepProtocolState,
  parseAutomationAgentDirectory,
  type AutomationAgentDirectorySnapshot,
} from '@/features/automation/agent-directory'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { useAgentDirectoryStream } from '@/features/automation/use-agent-directory-stream'
import {
  canQueryAutomationDispatchQueue,
  dispatchQueueStatusLabel,
  dispatchQueueTime,
  groupAutomationDispatchQueue,
  parseAutomationDispatchQueue,
  type AutomationDispatchQueueItem,
  type AutomationDispatchQueuePage,
} from '@/features/automation/dispatch-queue'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import {
  automationDispatchQueuePath,
  deliveryProjectsPath,
  type AutomationDispatchQueuePathQuery,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { ScopedFetcherKey } from '@/lib/request-context'
import { useStore } from '@/store/useStore'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CalendarDaysIcon,
  ComputerDesktopIcon,
  QueueListIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'

const PAGE_SIZE = 25
const ASSIGNMENT_STATUSES = ['pending', 'queued', 'dispatched', 'running', 'blocked'] as const
const EMPTY_PROJECTS: DeliveryProject[] = []
const EMPTY_AGENTS: AutomationAgentDirectorySnapshot['agents'] = []

type QueueFilters = {
  status: string
  project_id: string
  agent_key: string
}

const EMPTY_FILTERS: QueueFilters = { status: '', project_id: '', agent_key: '' }
const EMPTY_PAGES: AutomationDispatchQueuePage[] = []

function automationDispatchAgentProfileHref(agentKey: string | null | undefined) {
  if (typeof agentKey !== 'string' || agentKey.trim().length === 0) return null
  return `/automation/agents/${encodeURIComponent(agentKey)}`
}

function queueQuery(filters: QueueFilters, cursor?: string): AutomationDispatchQueuePathQuery {
  return {
    page_size: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.project_id ? { project_id: filters.project_id } : {}),
    ...(filters.agent_key ? { agent_key: filters.agent_key } : {}),
  }
}

function queueBadgeColor(status: string): 'blue' | 'green' | 'red' | 'amber' | 'zinc' {
  if (status === 'completed') return 'green'
  if (status === 'failed' || status === 'cancelled') return 'red'
  if (status === 'running' || status === 'dispatched') return 'blue'
  if (status === 'blocked') return 'amber'
  return 'zinc'
}

function targetAvailabilityLabel(status: AutomationDispatchQueueItem['target_availability']) {
  const labels: Record<AutomationDispatchQueueItem['target_availability'], string> = {
    unknown: 'Sin señal confirmada',
    offline: 'Sin latido reciente',
    draining: 'En drenado',
    no_capacity: 'Sin capacidad',
    saturated: 'Capacidad completa',
    working: 'Trabajando',
    available: 'Disponible',
  }
  return labels[status]
}

function targetAvailabilityColor(
  status: AutomationDispatchQueueItem['target_availability']
): 'green' | 'blue' | 'amber' | 'zinc' {
  if (status === 'available') return 'green'
  if (status === 'working') return 'blue'
  if (status === 'draining' || status === 'saturated' || status === 'no_capacity') return 'amber'
  return 'zinc'
}

function agentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    available: 'Disponible',
    working: 'En ejecución',
    draining: 'En drenado',
    offline: 'Sin señal reciente',
  }
  return labels[status] ?? 'Estado no reportado'
}

function protocolLabel(protocols: readonly string[] | undefined) {
  const state = automationAgentPlanStepProtocolState(protocols)
  if (state === 'supported') return { label: 'Plan steps v1', color: 'green' as const }
  if (state === 'legacy') return { label: 'Sin protocolo de pasos', color: 'amber' as const }
  return { label: 'Protocolo desconocido', color: 'zinc' as const }
}

function AgentInstanceCard({
  agentName,
  specialty,
  instance,
  snapshotAt,
  scoped,
}: {
  agentName: string
  specialty: string
  instance: AutomationAgentDirectorySnapshot['agents'][number]['instances'][number]
  snapshotAt: string
  scoped: boolean
}) {
  const operational = automationAgentInstanceOperationalView(instance, snapshotAt)
  const protocol = protocolLabel(instance.protocols)
  const availableColor = targetAvailabilityColor(operational.availability)
  const availableLabel = targetAvailabilityLabel(operational.availability)

  return (
    <article className="rounded-xl border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words text-ink">{agentName}</h3>
          <p className="mt-0.5 text-xs text-ink-secondary">{specialty}</p>
          <p className="mt-2 text-xs break-all text-ink-muted">
            {instance.machine_id ? `Máquina · ${instance.machine_id}` : 'Máquina no reportada'}
            <span className="px-1.5">·</span>Worker {instance.worker_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge color={scoped ? (instance.status === 'working' ? 'blue' : 'zinc') : availableColor}>
            {scoped ? agentStatusLabel(instance.status) : availableLabel}
          </Badge>
          <Badge color={protocol.color}>{protocol.label}</Badge>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Ejecuciones visibles</dt>
          <dd className="mt-1 font-semibold tabular-nums text-ink">
            {instance.active_runs.length}{!scoped ? ` / ${instance.concurrency}` : ''}
          </dd>
          <dd className="mt-0.5 text-[11px] leading-4 text-ink-muted">
            {scoped ? 'Sólo actividad dentro del alcance seleccionado.' : 'De la concurrencia reportada por el worker.'}
          </dd>
        </div>
        {!scoped ? (
          <div>
            <dt className="text-ink-muted">Espacios libres estimados</dt>
            <dd className="mt-1 font-semibold tabular-nums text-ink">{operational.effectiveAvailableSlots}</dd>
            <dd className="mt-0.5 text-[11px] leading-4 text-ink-muted">Señal al corte; no valida acceso al workspace.</dd>
          </div>
        ) : (
          <div>
            <dt className="text-ink-muted">Concurrencia reportada</dt>
            <dd className="mt-1 font-semibold tabular-nums text-ink">{instance.concurrency}</dd>
            <dd className="mt-0.5 text-[11px] leading-4 text-ink-muted">No se calcula capacidad libre entre proyectos.</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-muted">Último latido</dt>
          <dd className="mt-1 text-ink-secondary">{dispatchQueueTime(instance.last_seen_at)}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-border-subtle pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-ink">Trabajo actual reportado</h4>
          <Badge color="zinc">{instance.active_runs.length}</Badge>
        </div>
        {instance.active_runs.length ? (
          <ul className="space-y-2">
            {instance.active_runs.map((run) => (
              <li key={`${run.task_id}:${run.run_id}`} className="rounded-lg bg-surface-soft px-3 py-2 text-xs">
                <p className="font-medium text-ink">
                  {run.work_item_id ? (
                    <Link className="hover:text-(--tenant-accent) hover:underline" href={`/automation/work-items/${encodeURIComponent(run.work_item_id)}`}>
                      {run.work_item_title || run.task_id}
                    </Link>
                  ) : run.work_item_title || run.task_id}
                </p>
                <p className="mt-1 text-ink-secondary">
                  {run.project_id ? (
                    <Link className="hover:text-(--tenant-accent) hover:underline" href={`/automation/projects/${encodeURIComponent(run.project_id)}`}>
                      {run.project_name || run.project_id}
                    </Link>
                  ) : run.project_name || 'Proyecto no reportado'}
                  {run.epic_title ? ` · ${run.epic_title}` : ''}
                  {run.step_key ? ` · Paso ${run.step_key}` : ''}
                </p>
                <p className="mt-1 text-ink-muted">{run.operation} · {run.status} · ejecución {run.run_id}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border-subtle px-3 py-3 text-xs text-ink-muted">
            Sin ejecuciones activas reportadas en este snapshot.
          </p>
        )}
      </div>
    </article>
  )
}

function FilterText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-10 min-w-0 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15"
      />
    </label>
  )
}

function QueueCard({ item }: { item: AutomationDispatchQueueItem }) {
  const agentProfileHref = automationDispatchAgentProfileHref(item.target_agent_key)

  return (
    <article className="rounded-xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold break-words text-ink">{item.step_title}</h3>
            {item.step_key && (
              <span className="rounded-lg bg-surface-soft px-2 py-1 text-[11px] font-medium text-ink-muted">
                {item.step_key}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            <Link
              className="font-medium text-(--tenant-accent) hover:underline"
              href={`/automation/work-items/${encodeURIComponent(item.work_item_id)}`}
            >
              {item.work_item_title}
            </Link>
            <span className="px-1.5 text-ink-muted">·</span>
            <Link
              className="hover:text-ink hover:underline"
              href={`/automation/projects/${encodeURIComponent(item.project_id)}`}
            >
              {item.project_name}
            </Link>
            <span className="px-1.5 text-ink-muted">·</span>
            {item.client_name}
          </p>
        </div>
        <Badge color={queueBadgeColor(item.assignment_status)}>
          {dispatchQueueStatusLabel(item.assignment_status)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0">
          <p className="text-ink-muted">Paso</p>
          <p className="mt-1 truncate font-medium text-ink">{dispatchQueueStatusLabel(item.step_status)}</p>
          <p className="mt-0.5 break-all text-ink-muted">{item.step_id}</p>
        </div>
        <div className="min-w-0">
          <p className="text-ink-muted">Tarea</p>
          <p className="mt-1 truncate font-medium text-ink">{dispatchQueueStatusLabel(item.work_item_state)}</p>
          <p className="mt-0.5 break-all text-ink-muted">{item.work_item_id}</p>
        </div>
        <div className="min-w-0">
          <p className="text-ink-muted">Dependencias</p>
          <p className={`mt-1 font-medium ${item.is_ready ? 'text-emerald-700' : 'text-ink-secondary'}`}>
            {item.is_ready ? 'Paso listo y dependencias resueltas' : 'Pendiente de paso o dependencias'}
          </p>
          <p className="mt-0.5 text-ink-muted">No representa disponibilidad del worker</p>
        </div>
        <div className="min-w-0">
          <p className="text-ink-muted">Actividad</p>
          <p className="mt-1 text-ink-secondary">Creada: {dispatchQueueTime(item.created_at)}</p>
          <p className="mt-0.5 text-ink-muted">En cola: {dispatchQueueTime(item.queued_at)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-ink-muted">Agente objetivo</p>
          {agentProfileHref ? (
            <Link className="mt-1 inline-block max-w-full break-all font-medium text-(--tenant-accent) hover:underline" href={agentProfileHref}>
              {item.target_agent_key}
            </Link>
          ) : (
            <p className="mt-1 text-ink-muted">Sin agente asignado</p>
          )}
        </div>
      </div>

      <details className="mt-4 border-t border-border-subtle pt-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink-secondary">Ver identificadores y tiempos</summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <QueueDetail label="Asignación" value={item.assignment_id} />
          <QueueDetail label="Ejecución" value={item.execution_id} />
          <QueueDetail label="Despachada" value={dispatchQueueTime(item.dispatched_at)} />
          <QueueDetail label="Iniciada" value={dispatchQueueTime(item.started_at)} />
        </dl>
      </details>
    </article>
  )
}

function QueueDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium break-all text-ink">{value}</dd>
    </div>
  )
}

export default function AutomationDispatchPage() {
  const [draft, setDraft] = useState<QueueFilters>({ ...EMPTY_FILTERS })
  const [applied, setApplied] = useState<QueueFilters>({ ...EMPTY_FILTERS })
  const workspaceMode = useStore((state) => state.workspaceMode)
  const currentClient = useStore((state) => state.currentClient)
  const scopeFetcherKey = useScopedFetcherScope()
  const isOrganization = workspaceMode === 'organization'
  const projectListKey = isOrganization && !currentClient?.id ? null : scopeFetcherKey(deliveryProjectsPath())
  const projectList = useSWR<DeliveryProject[]>(projectListKey, fetcher, {
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
    keepPreviousData: false,
  })
  const projects = projectList.data ?? EMPTY_PROJECTS
  const projectOptions = useMemo(
    () =>
      [...projects]
        .filter((project) => project.id && project.client_id)
        .sort((left, right) => left.name.localeCompare(right.name, 'es-MX')),
    [projects]
  )
  const projectListReady = projectList.data !== undefined
  const directoryScope = useMemo(() => {
    if (applied.project_id) return { project_id: applied.project_id }
    if (isOrganization && currentClient?.id) return { client_id: currentClient.id }
    return isOrganization ? null : {}
  }, [applied.project_id, currentClient?.id, isOrganization])
  const directoryKey = directoryScope ? scopeFetcherKey(automationAgentDirectoryPath(directoryScope)) : null
  const directory = useSWR<AutomationAgentDirectorySnapshot>(
    directoryKey,
    async (key: ScopedFetcherKey) => parseAutomationAgentDirectory(await fetcher<unknown>(key)),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: false }
  )
  const canQueryQueue = canQueryAutomationDispatchQueue(
    workspaceMode,
    applied.project_id,
    projectOptions.map((project) => project.id),
    !isOrganization || (Boolean(currentClient?.id) && projectListReady)
  )
  const queue = useSWRInfinite<AutomationDispatchQueuePage>(
    (index, previousPage) => {
      if (!canQueryQueue) return null
      if (index > 0 && !previousPage?.next_cursor) return null
      return scopeFetcherKey(automationDispatchQueuePath(queueQuery(applied, index > 0 ? previousPage?.next_cursor : undefined)))
    },
    async (key: ScopedFetcherKey) => parseAutomationDispatchQueue(await fetcher<unknown>(key)),
    { initialSize: 1, persistSize: false, revalidateOnFocus: true, revalidateFirstPage: true, revalidateAll: false }
  )

  const pages = canQueryQueue ? (queue.data ?? EMPTY_PAGES) : EMPTY_PAGES
  const items = pages.flatMap((page) => page.items)
  const groups = groupAutomationDispatchQueue(items)
  const dispatchHealth = pages[0]
  const latestPage = pages.at(-1)
  const hasMore = Boolean(latestPage?.next_cursor)
  const directoryIsScoped = isOrganization || Boolean(applied.project_id)
  const instances = useMemo(
    () => (directory.data?.agents ?? EMPTY_AGENTS)
      .flatMap((agent) => agent.instances.map((instance) => ({
        agentName: agent.name || agent.agent_key,
        specialty: agent.specialty,
        instance,
      })))
      .sort((left, right) =>
        right.instance.active_runs.length - left.instance.active_runs.length ||
        left.agentName.localeCompare(right.agentName, 'es-MX') ||
        left.instance.worker_id.localeCompare(right.instance.worker_id)
      ),
    [directory.data]
  )
  const mutateDirectory = directory.mutate
  const mutateQueue = queue.mutate
  const refreshOperationalSnapshot = useCallback(() => {
    void mutateDirectory()
    void mutateQueue()
  }, [mutateDirectory, mutateQueue])

  useAgentDirectoryStream({
    enabled: workspaceMode === 'platform',
    onSnapshot: refreshOperationalSnapshot,
    onUpdate: refreshOperationalSnapshot,
  })

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setApplied({ status: draft.status.trim(), project_id: draft.project_id.trim(), agent_key: draft.agent_key.trim() })
    void queue.setSize(1)
  }
  const clearFilters = () => {
    setDraft({ ...EMPTY_FILTERS })
    setApplied({ ...EMPTY_FILTERS })
    void queue.setSize(1)
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader
          eyebrow="Automatización · Operación"
          title="Colas y despacho"
          description={
            isOrganization
              ? 'Consulta los pasos asignados de un proyecto. La actividad global de equipos locales permanece privada.'
              : 'Consulta los pasos asignados a equipos locales, su destino, señal de actividad y avance.'
          }
          icon={QueueListIcon}
          actions={
            <Button outline disabled={!canQueryQueue && !directoryScope} onClick={refreshOperationalSnapshot}>
              <ArrowPathIcon data-slot="icon" />
              Actualizar
            </Button>
          }
        />

        <nav aria-label="Secciones de agentes" className="-mt-2 overflow-x-auto">
          <div className="flex min-w-max border-b border-border-subtle">
            <Link
              href="/automation/dispatch"
              aria-current="page"
              className="inline-flex min-h-11 items-center gap-2 border-b-2 border-(--tenant-accent) px-4 text-sm font-semibold text-(--tenant-accent)"
            >
              <BoltIcon className="size-4" /> En vivo
            </Link>
            <Link href="/automation/agents" className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm text-ink-secondary hover:text-ink">
              <UsersIcon className="size-4" /> Agentes
            </Link>
            <a href="#instancias" className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm text-ink-secondary hover:text-ink">
              <ComputerDesktopIcon className="size-4" /> Instancias
            </a>
            <Link href="/automation/recurrences" className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm text-ink-secondary hover:text-ink">
              <CalendarDaysIcon className="size-4" /> Recurrentes
            </Link>
          </div>
        </nav>

        {directory.data ? (
          <section aria-label="Resumen del despacho" className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Snapshot operativo de agentes</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Actualizado {dispatchQueueTime(directory.data.generated_at)} · {directoryIsScoped ? 'alcance de organización/proyecto' : 'alcance de plataforma'}
                </p>
              </div>
              {directory.isValidating && <Badge color="blue">Actualizando</Badge>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: directoryIsScoped ? 'Instancias con actividad visible' : 'Instancias vivas', value: directory.data.summary.live_instances },
                { label: 'Ejecuciones activas', value: directory.data.summary.active_runs },
                { label: 'Tareas de automatización en cola', value: directory.data.summary.queued_tasks },
                { label: 'Slots disponibles', value: directoryIsScoped ? '—' : directory.data.summary.available_slots },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl bg-surface-soft px-3 py-3">
                  <dt className="text-xs text-ink-muted">{metric.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{metric.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-border-subtle pt-3 text-xs leading-5 text-ink-muted">
              Las tareas en cola son el resumen de automatización del directorio; no son la misma cola que las asignaciones de pasos mostradas abajo.
              Los indicadores de asignaciones bloqueadas y leases vencidos aparecen en el resumen de la cola con los filtros aplicados; no se infieren desde la página cargada ni sugieren tareas sin asignar.
              {directoryIsScoped ? ' En este alcance no se calcula capacidad libre entre proyectos.' : ''}
            </p>
          </section>
        ) : directory.error ? (
          <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">No se pudo consultar la salud de instancias</h2>
                <p className="mt-1 text-xs leading-5">La cola de pasos sigue disponible; los totales de agentes no se inventan a partir de una página parcial.</p>
              </div>
              <Button outline onClick={() => void directory.mutate()}>Reintentar snapshot</Button>
            </div>
          </section>
        ) : directory.isLoading ? (
          <div role="status" className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted">
            Cargando snapshot de agentes e instancias…
          </div>
        ) : null}

        <section
          className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:p-5"
          aria-label="Modelo de despacho"
        >
          <ShieldCheckIcon className="size-5 text-sky-700" />
          <div>
            <h2 className="font-semibold">Asignación automática del plan aprobado</h2>
            <p className="mt-1 leading-6">
              El orquestador fija el destino de cada paso según dependencias y capacidad. Esta consola es de solo
              lectura: no ofrece una reasignación manual que el backend no pueda garantizar.
            </p>
          </div>
        </section>

        {canQueryQueue && dispatchHealth && (
          <section
            aria-label="Salud de asignaciones"
            className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Salud de asignaciones</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Conteos del snapshot del servidor, bajo los filtros activos; no dependen de cuántas páginas cargaste.
                </p>
              </div>
              <Badge color="zinc">{isOrganization ? 'Proyecto autorizado' : 'Alcance de plataforma'}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Asignaciones bloqueadas', value: dispatchHealth.blocked_assignments },
                { label: 'Leases de pasos vencidos', value: dispatchHealth.expired_plan_step_leases },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl bg-surface-soft px-3 py-3">
                  <dt className="text-xs text-ink-muted">{metric.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">
                    {metric.value === undefined ? '—' : metric.value}
                  </dd>
                  {metric.value === undefined && (
                    <dd className="mt-0.5 text-[11px] text-ink-muted">La API conectada aún no publica este contador.</dd>
                  )}
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Incluye sólo asignaciones de planes aprobados, no terminales y dentro del proyecto/agente/estado consultado. Los leases se cuentan al corte de la instantánea.
            </p>
          </section>
        )}

        <section
          aria-label="Filtros de cola"
          className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5"
        >
          <form onSubmit={applyFilters} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                <span>Estado de asignación</span>
                <select
                  aria-label="Estado de asignación"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                  className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15"
                >
                  <option value="">Todos los estados</option>
                  {ASSIGNMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {dispatchQueueStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary">
                <span>Proyecto{isOrganization ? ' (requerido)' : ''}</span>
                <select
                  aria-label="Proyecto"
                  value={draft.project_id}
                  onChange={(event) => setDraft((current) => ({ ...current, project_id: event.target.value }))}
                  disabled={
                    projectList.isLoading || Boolean(projectList.error) || (isOrganization && !currentClient?.id)
                  }
                  className="min-h-10 min-w-0 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15 disabled:opacity-60"
                >
                  <option value="">{isOrganization ? 'Selecciona un proyecto' : 'Todos los proyectos'}</option>
                  {projectOptions.map((project) => {
                    const clientName = project.client?.name?.trim()
                    return (
                      <option key={project.id} value={project.id}>
                        {!isOrganization && clientName ? `${clientName} · ` : ''}
                        {project.name}
                      </option>
                    )
                  })}
                </select>
              </label>
              <FilterText
                label="Clave de agente"
                value={draft.agent_key}
                onChange={(agent_key) => setDraft((current) => ({ ...current, agent_key }))}
                placeholder="frontend-specialist"
              />
              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1">
                  Aplicar filtros
                </Button>
                <Button outline type="button" onClick={clearFilters}>
                  Limpiar
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 border-t border-border-subtle pt-3 text-xs leading-5 text-ink-muted">
              <ComputerDesktopIcon className="mt-0.5 size-4 shrink-0" />
              {isOrganization
                ? 'La API exige el proyecto seleccionado y solo devuelve sus asignaciones; no consulta métricas globales de máquinas o workers.'
                : 'Los filtros se aplican en el servidor dentro del ámbito autorizado de tu sesión. La paginación usa cursor; no se descargan todas las asignaciones al navegador.'}
            </p>
          </form>
          {projectList.error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              No se pudieron cargar los proyectos autorizados. Reintenta para elegir uno.
            </p>
          )}
          {isOrganization && !projectList.error && !projectList.isLoading && projectOptions.length === 0 && (
            <p role="status" className="mt-3 text-sm text-ink-muted">
              No hay proyectos disponibles en esta organización.
            </p>
          )}
        </section>

        {directory.data && (
          <section id="instancias" aria-label="Instancias de trabajo (workers)" className="space-y-3">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-ink">Instancias de trabajo (workers)</h2>
                <p className="mt-1 text-sm text-ink-secondary">
                  {directoryIsScoped
                    ? 'El alcance muestra instancias con actividad autorizada; no equivale al inventario completo del equipo.'
                    : 'Heartbeat, capacidad anunciada y ejecuciones reportadas por cada worker.'}
                </p>
              </div>
              <Badge color="zinc">{instances.length} {instances.length === 1 ? 'instancia' : 'instancias'} en la captura</Badge>
            </header>
            {instances.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {instances.map(({ agentName, specialty, instance }) => (
                  <AgentInstanceCard
                    key={instance.worker_id}
                    agentName={agentName}
                    specialty={specialty}
                    instance={instance}
                    snapshotAt={directory.data!.generated_at}
                    scoped={directoryIsScoped}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border-subtle bg-surface-raised p-6 text-sm text-ink-muted">
                No hay instancias reportadas para este alcance en la captura actual.
              </p>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <p>
            {items.length
              ? `${items.length} asignaciones cargadas en ${groups.length} grupos de agente${workspaceMode === 'platform' ? ' y máquina' : ''}`
              : 'La cola autorizada aparecerá aquí.'}
          </p>
          {latestPage?.generated_at && (
            <p>
              Instantánea consultada {dispatchQueueTime(latestPage.generated_at)} · máximo {PAGE_SIZE} por página
            </p>
          )}
          {queue.isValidating && !queue.isLoading && <Badge color="blue">Actualizando</Badge>}
        </div>

        {!canQueryQueue ? (
          <section
            role="status"
            className="rounded-2xl border border-sky-200 bg-sky-50 p-8 text-center text-sm text-sky-950"
          >
            <h2 className="font-semibold">
              {!currentClient?.id
                ? 'Selecciona una organización'
                : projectList.isLoading
                  ? 'Cargando proyectos autorizados…'
                  : projectList.error
                    ? 'No se pudieron cargar los proyectos'
                    : 'Selecciona un proyecto para consultar la cola'}
            </h2>
            <p className="mx-auto mt-1 max-w-lg leading-6">
              {!currentClient?.id
                ? 'Elige una organización para cargar sus proyectos visibles.'
                : projectList.isLoading
                  ? 'La cola no se consulta hasta tener la lista de proyectos autorizados.'
                  : projectList.error
                    ? 'Reintenta la carga de proyectos antes de consultar la cola.'
                    : 'En un espacio de organización no se permite consultar una cola global. El selector solo muestra proyectos autorizados para tu sesión.'}
            </p>
          </section>
        ) : queue.error ? (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
            <h2 className="font-semibold">No se pudo cargar la cola</h2>
            <p className="mt-1">
              La solicitud falló o la respuesta no cumple el contrato esperado. Revisa tu sesión y vuelve a intentar.
            </p>
            <div className="mt-4">
              <Button outline onClick={() => void queue.mutate()}>
                Reintentar
              </Button>
            </div>
          </section>
        ) : queue.isLoading ? (
          <div
            role="status"
            className="rounded-2xl border border-border-subtle bg-surface-raised p-10 text-center text-sm text-ink-muted"
          >
            Cargando asignaciones autorizadas…
          </div>
        ) : items.length === 0 ? (
          <section className="rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center">
            <QueueListIcon className="mx-auto size-8 text-ink-muted" />
            <h2 className="mt-3 font-semibold text-ink">No hay asignaciones para mostrar</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-ink-secondary">
              {Object.values(applied).some(Boolean)
                ? 'Cambia o limpia los filtros para revisar otros pasos asignados.'
                : 'Cuando existan pasos asignados por los planes aprobados aparecerán aquí.'}
            </p>
          </section>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const agentLabel = group.agentKey ?? 'Sin agente objetivo'
              const machineLabel = group.machineId ?? 'Sin máquina objetivo'
              const showWorkerSignals = workspaceMode === 'platform'
              return (
                <section
                  key={`${group.agentKey ?? ''}:${group.machineId ?? ''}`}
                  aria-label={`${agentLabel} · ${machineLabel}`}
                  className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft/50 shadow-sm"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                        <ComputerDesktopIcon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-semibold break-all text-ink">{agentLabel}</h2>
                        {showWorkerSignals ? (
                          <>
                            <p className="mt-0.5 text-xs break-all text-ink-secondary">{machineLabel}</p>
                            <p className="mt-1 text-xs text-ink-muted">
                              Señal: {dispatchQueueTime(group.items[0].target_last_seen_at)} ·{' '}
                              {group.items[0].target_active_runs} en ejecución
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-ink-muted">Asignaciones de este proyecto</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {showWorkerSignals && (
                        <>
                          <Badge color={targetAvailabilityColor(group.items[0].target_availability)}>
                            {targetAvailabilityLabel(group.items[0].target_availability)}
                          </Badge>
                          <Badge color="zinc">
                            {group.items[0].target_available_slots}/{group.items[0].target_concurrency} espacios libres
                          </Badge>
                        </>
                      )}
                      <Badge color="zinc">
                        {group.items.length} {group.items.length === 1 ? 'paso' : 'pasos'}
                      </Badge>
                    </div>
                  </header>
                  <div className="space-y-3 p-3 sm:p-4">
                    {group.items.map((item) => (
                      <QueueCard key={item.assignment_id} item={item} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {hasMore && !queue.error && (
          <div className="flex justify-center">
            <Button outline disabled={queue.isValidating} onClick={() => void queue.setSize(queue.size + 1)}>
              Cargar más asignaciones
            </Button>
          </div>
        )}
        {!hasMore && items.length > 0 && (
          <p className="pb-4 text-center text-xs text-ink-muted">
            No hay más asignaciones en esta consulta.{' '}
            <Link
              className="inline-flex items-center gap-1 font-medium text-(--tenant-accent) hover:underline"
              href="/automation/traces"
            >
              Ver trazas
              <ArrowTopRightOnSquareIcon className="size-3.5" />
            </Link>
          </p>
        )}
      </main>
    </PageTransition>
  )
}
