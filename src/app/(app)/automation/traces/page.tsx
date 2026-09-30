'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { parseAutomationAgentDirectory } from '@/features/automation/agent-directory'
import type { AutomationAgentDirectorySnapshot } from '@/features/automation/agent-directory'
import { parseAutomationTraceHistory } from '@/features/automation/automation-trace-history'
import { automationTraceCostState } from '@/features/automation/automation-trace-history'
import type { AutomationTraceItem, AutomationTracePage } from '@/features/automation/automation-trace-history'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { automationAgentsPath, automationTraceHistoryPath, deliveryProjectPath, deliveryProjectsPath, deliveryWorkItemPath, type AutomationTraceHistoryFilters } from '@/lib/api-paths'
import { deliveryEpicDetailPath } from '@/features/automation/delivery-epics'
import { fetcher } from '@/lib/fetcher'
import { useStore } from '@/store/useStore'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ClipboardDocumentListIcon,
  ShieldCheckIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'

const TRACE_PAGE_SIZE = 50
const EMPTY_TRACE_PAGES: AutomationTracePage[] = []
// Keep these query values aligned with the backend's history allow-lists.
const TRACE_OPERATIONS = [
  'ai.chat', 'document.analyze', 'code.review', 'product.ideate', 'delivery.chat',
  'delivery.plan', 'delivery.implementation', 'delivery.publish', 'delivery.qa', 'delivery.summary',
]
const TRACE_STATUSES = [
  'queued', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled', 'approved', 'changes_requested', 'dispatched',
  'pending', 'planned', 'ready', 'blocked', 'started', 'skipped',
]
const TRACE_PROVIDERS = ['minimax', 'deepseek', 'openrouter', 'openai', 'anthropic', 'opencode-go']

type TraceHistoryFilters = AutomationTraceHistoryFilters & {
  model?: string | null
  run_id?: string | null
}

type DraftFilters = {
  [Key in Exclude<keyof TraceHistoryFilters, 'limit' | 'cursor' | 'snapshot_at'>]-?: string
}

const EMPTY_FILTERS: DraftFilters = {
  q: '',
  client_id: '',
  project_id: '',
  epic_id: '',
  work_item_id: '',
  step_id: '',
  step_key: '',
  agent_key: '',
  worker_id: '',
  machine_id: '',
  agent_instance_id: '',
  operation: '',
  tool: '',
  status: '',
  provider: '',
  model: '',
  run_id: '',
  from: '',
  to: '',
}

function displayTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function displayCount(value?: number | null) {
  return new Intl.NumberFormat('es-MX').format(value ?? 0)
}

function displayCost(microusd?: number | null) {
  if (microusd == null) return 'No disponible'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format((microusd ?? 0) / 1_000_000)
}

function displayEventCost(item: AutomationTraceItem) {
  const cost = automationTraceCostState(item)
  if (cost.status === 'verified') return `${displayCost(cost.amountMicrousd)} · Verificado USD`
  if (cost.status === 'unknown') return 'Importe USD no verificado'
  return 'No disponible'
}

function traceAgentLabel(agentKey: string | null | undefined, names: Map<string, string>) {
  if (!agentKey) return 'Sistema'
  if (agentKey === 'unknown') return 'Sin atribución'
  return names.get(agentKey) ?? agentKey
}

function traceActorLabel(item: AutomationTraceItem, names: Map<string, string>) {
  return item.kind === 'gate_decision' ? 'Humano' : traceAgentLabel(item.agent_key, names)
}

function eventLabel(item: AutomationTraceItem) {
  const labels: Record<string, string> = {
    task: 'Tarea', task_event: 'Cambio de estado', inference: 'Inferencia', tool_call: 'Herramienta',
    step_event: 'Paso', step_activity: 'Actividad de paso',
    assignment_event: 'Asignación', gate_decision: 'Decisión de revisión', step_evidence: 'Evidencia de paso',
    created: 'Tarea creada', claimed: 'Tarea asignada', status_transition: 'Cambio de estado',
    lease_reclaimed: 'Reserva recuperada', assignment_changed: 'Reasignación', attempt_updated: 'Intento actualizado',
    recorded: 'Evento registrado',
  }
  return labels[item.kind] ?? 'Evento'
}

function safeStatus(value?: string | null) {
  const safe = new Set(['queued', 'running', 'dispatched', 'cancel_requested', 'started', 'completed', 'failed', 'cancelled', 'recorded', 'blocked', 'pending', 'planned', 'ready', 'skipped', 'approved', 'changes_requested'])
  return value && safe.has(value) ? value : 'registrado'
}

function statusColor(value?: string | null): 'red' | 'orange' | 'green' | 'zinc' {
  const status = safeStatus(value)
  if (status === 'failed') return 'red'
  if (status === 'changes_requested') return 'orange'
  if (status === 'completed' || status === 'approved') return 'green'
  return 'zinc'
}

function traceEventTypeLabel(value?: string | null) {
  if (!value) return undefined
  const labels: Record<string, string> = {
    plan: 'Plan', code_review: 'Code review', qa: 'QA', release: 'Release',
    assignment_created: 'Asignación creada', status_changed: 'Estado actualizado',
    target_changed: 'Destino reasignado', status_and_target_changed: 'Estado y destino actualizados',
  }
  return labels[value] ?? value.slice(0, 80)
}

function traceQueryKey(filters: TraceHistoryFilters, cursor?: string, snapshotAt?: string) {
  return automationTraceHistoryPath({ ...filters, limit: TRACE_PAGE_SIZE, cursor, snapshot_at: snapshotAt })
}

function hasTraceField(item: AutomationTraceItem, field: keyof AutomationTraceItem) {
  return Object.prototype.hasOwnProperty.call(item, field)
}

function localDateToIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'datetime-local'
  maxLength?: number
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-h-10 min-w-0 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none transition focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15"
      />
    </label>
  )
}

export default function AutomationTracesPage() {
  const [draft, setDraft] = useState<DraftFilters>({ ...EMPTY_FILTERS })
  const [applied, setApplied] = useState<AutomationTraceHistoryFilters>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const directory = useSWR<AutomationAgentDirectorySnapshot>(workspaceMode === 'platform' ? automationAgentsPath() : null, async (path) =>
    parseAutomationAgentDirectory(await fetcher<unknown>(path)), { refreshInterval: 60_000, revalidateOnFocus: true })
  const projectList = useSWR<DeliveryProject[]>(deliveryProjectsPath(), fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
  })
  const projects = projectList.data ?? []
  const availableClients = [...new Map(projects.map((project) => [
    project.client_id,
    { id: project.client_id, name: project.client?.name?.trim() || project.client_id },
  ])).values()].sort((left, right) => left.name.localeCompare(right.name, 'es'))
  const availableProjects = projects.filter((project) => !draft.client_id || project.client_id === draft.client_id)
  // Organization workspaces are intentionally project-scoped by the API. Do
  // not even issue an unscoped history request while the operator chooses it.
  const canQueryTraces = workspaceMode !== 'organization' || Boolean(applied.project_id)
  const history = useSWRInfinite<AutomationTracePage>(
    (index, previousPage) => {
      if (!canQueryTraces) return null
      if (index > 0 && (!previousPage?.has_more || !previousPage.next_cursor)) return null
      return traceQueryKey(applied, index > 0 ? previousPage?.next_cursor : undefined, index > 0 ? previousPage?.snapshot_at : undefined)
    },
    async (path) => parseAutomationTraceHistory(await fetcher<unknown>(path)),
    { initialSize: 1, persistSize: false, revalidateOnFocus: true, revalidateFirstPage: true, revalidateAll: false },
  )

  const pages = history.data ?? EMPTY_TRACE_PAGES
  const items = useMemo(() => pages.flatMap((page) => page.items), [pages])
  const selected = items.find((item) => item.id === selectedId) ?? null
  const selectedWorkItemHref = selected?.work_item_id ? deliveryWorkItemPath(selected.work_item_id) : null
  const selectedStepHref = selectedWorkItemHref && selected?.step_key
    ? `${selectedWorkItemHref}?step=${encodeURIComponent(selected.step_key)}`
    : selectedWorkItemHref
  const agentNames = useMemo(() => new Map((directory.data?.agents ?? []).map((agent) => [agent.agent_key, agent.name])), [directory.data])
  const latestPage = pages.at(-1)
  const hasMore = Boolean(latestPage?.has_more && latestPage.next_cursor)

  const change = (key: keyof DraftFilters, value: string) => setDraft((current) => ({ ...current, [key]: key === 'q' ? value.slice(0, 120) : value }))
  const changeClient = (clientId: string) => setDraft((current) => ({ ...current, client_id: clientId, project_id: '' }))
  const changeProject = (projectId: string) => {
    const selectedProject = projects.find((project) => project.id === projectId)
    setDraft((current) => ({
      ...current,
      project_id: projectId,
      client_id: projectId ? (selectedProject?.client_id ?? current.client_id) : current.client_id,
    }))
  }
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFilters: TraceHistoryFilters = {}
    for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof DraftFilters>) {
      const value = draft[key].trim().slice(0, key === 'q' ? 120 : undefined)
      if (value) Object.assign(nextFilters, { [key]: value })
    }
    nextFilters.from = localDateToIso(draft.from) || undefined
    nextFilters.to = localDateToIso(draft.to) || undefined
    setApplied(nextFilters)
    setSelectedId(null)
    void history.setSize(1)
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader
          eyebrow="Automatización · Auditoría"
          title="Trazabilidad de ejecuciones"
          description="Consulta los eventos de agentes, herramientas y pasos en una línea de tiempo global. Los filtros y la paginación permanecen dentro del ámbito autorizado."
          icon={ClipboardDocumentListIcon}
          actions={(
            <Button outline onClick={() => void history.mutate()}>
              <ArrowPathIcon data-slot="icon" /> Actualizar
            </Button>
          )}
        />

        <section aria-label="Filtros de trazabilidad" className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
          <form onSubmit={applyFilters} className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-ink">Contexto de trabajo</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <FilterInput label="Buscar en trazas" value={draft.q} onChange={(value) => change('q', value)} placeholder="Agente, herramienta, estado…" maxLength={120} />
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Cliente / empresa</span>
                  <select aria-label="Cliente / empresa" value={draft.client_id} onChange={(event) => changeClient(event.target.value)} disabled={projectList.isLoading || Boolean(projectList.error)} className="min-h-10 min-w-0 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15 disabled:opacity-60">
                    <option value="">Todos los clientes</option>
                    {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Proyecto</span>
                  <select aria-label="Proyecto" value={draft.project_id} onChange={(event) => changeProject(event.target.value)} disabled={projectList.isLoading || Boolean(projectList.error) || availableProjects.length === 0} className="min-h-10 min-w-0 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15 disabled:opacity-60">
                    <option value="">Todos los proyectos</option>
                    {availableProjects.map((project) => {
                      const clientName = project.client?.name?.trim() || availableClients.find((client) => client.id === project.client_id)?.name
                      return <option key={project.id} value={project.id}>{draft.client_id ? project.name : `${clientName ? `${clientName} · ` : ''}${project.name}`}</option>
                    })}
                  </select>
                </label>
                <FilterInput label="ID de épica" value={draft.epic_id} onChange={(value) => change('epic_id', value)} />
                <FilterInput label="ID de tarea" value={draft.work_item_id} onChange={(value) => change('work_item_id', value)} />
                <FilterInput label="ID de paso" value={draft.step_id} onChange={(value) => change('step_id', value)} />
              </div>
              {projectList.error && <p role="alert" className="mt-3 text-sm text-rose-700">No se pudieron cargar los proyectos autorizados. Reintenta para elegir un proyecto.</p>}
              {!projectList.error && !projectList.isLoading && projects.length === 0 && <p className="mt-3 text-sm text-ink-muted">No hay proyectos disponibles en este espacio de trabajo.</p>}
              {workspaceMode === 'organization' && !applied.project_id && <p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">En el espacio de una organización, selecciona un proyecto y aplica los filtros para consultar sus trazas.</p>}
            </div>

            <div className="border-t border-border-subtle pt-4">
              <h2 className="text-sm font-semibold text-ink">Ejecución y agente</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {workspaceMode === 'platform' ? (
                  <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                    <span>Agente</span>
                    <select aria-label="Agente" value={draft.agent_key} onChange={(event) => change('agent_key', event.target.value)} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15">
                      <option value="">Todos los agentes</option>
                      {(directory.data?.agents ?? []).map((agent) => <option key={agent.agent_key} value={agent.agent_key}>{agent.name} · {agent.specialty}</option>)}
                    </select>
                  </label>
                ) : (
                  <FilterInput label="Agente" value={draft.agent_key} onChange={(value) => change('agent_key', value)} placeholder="frontend-specialist" />
                )}
                <FilterInput label="ID de worker" value={draft.worker_id} onChange={(value) => change('worker_id', value)} />
                <FilterInput label="ID de máquina" value={draft.machine_id} onChange={(value) => change('machine_id', value)} />
                <FilterInput label="ID de instancia" value={draft.agent_instance_id} onChange={(value) => change('agent_instance_id', value)} />
                <FilterInput label="Clave del paso" value={draft.step_key} onChange={(value) => change('step_key', value)} placeholder="build, qa…" />
                <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Operación</span>
                  <select aria-label="Operación" value={draft.operation} onChange={(event) => change('operation', event.target.value)} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15">
                    <option value="">Todas las operaciones</option>
                    {TRACE_OPERATIONS.map((operation) => <option key={operation}>{operation}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Herramienta</span>
                  <select value={draft.tool} onChange={(event) => change('tool', event.target.value)} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15">
                    <option value="">Todas las herramientas</option>
                    <option value="stagehand">Stagehand</option>
                    <option value="agent_loop">Agent loop</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Estado</span>
                  <select value={draft.status} onChange={(event) => change('status', event.target.value)} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15">
                    <option value="">Todos los estados</option>
                    {TRACE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-ink-secondary">
                  <span>Proveedor</span>
                  <select aria-label="Proveedor" value={draft.provider} onChange={(event) => change('provider', event.target.value)} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink outline-none focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15">
                    <option value="">Todos los proveedores</option>
                    {TRACE_PROVIDERS.map((provider) => <option key={provider}>{provider}</option>)}
                  </select>
                </label>
                <FilterInput label="Modelo exacto" value={draft.model} onChange={(value) => change('model', value)} placeholder="model-id" />
                <FilterInput label="Run ID de ejecución" value={draft.run_id} onChange={(value) => change('run_id', value)} placeholder="ID de ejecución" />
                <FilterInput label="Desde" type="datetime-local" value={draft.from} onChange={(value) => change('from', value)} />
                <FilterInput label="Hasta" type="datetime-local" value={draft.to} onChange={(value) => change('to', value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <p className="inline-flex items-center gap-2 text-xs text-ink-muted"><ShieldCheckIcon className="size-4 text-emerald-600" /> Sin prompts, respuestas privadas, payloads ni razonamiento oculto.</p>
              <div className="flex gap-2">
                <Button outline type="button" onClick={() => { setDraft({ ...EMPTY_FILTERS }); setApplied({}); setSelectedId(null); void history.setSize(1) }}>Limpiar</Button>
                <Button type="submit">Aplicar filtros</Button>
              </div>
            </div>
          </form>
        </section>

        {latestPage?.snapshot_at && <p className="text-xs text-ink-muted">Instantánea estable desde {displayTime(latestPage.snapshot_at)} · hasta {TRACE_PAGE_SIZE} eventos por página</p>}

        {latestPage && (
          <section aria-label="Cobertura de costos de la página" className="rounded-2xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm shadow-sm sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Cobertura de costos · página {pages.length}</h2>
                {latestPage.cost_coverage ? (
                  <>
                    <p className="mt-1 text-ink-secondary">
                      {displayCount(latestPage.cost_coverage.verified_usd_executions)} {latestPage.cost_coverage.verified_usd_executions === 1 ? 'llamada' : 'llamadas'} con precio USD verificado · {displayCount(latestPage.cost_coverage.unpriced_executions)} sin precio confirmado
                    </p>
                    {latestPage.cost_coverage.unpriced_executions > 0 && <p className="mt-1 text-xs text-amber-800">La cobertura es parcial: los importes desconocidos no se cuentan como gasto cero.</p>}
                    {latestPage.cost_coverage.unpriced_executions === 0 && latestPage.cost_coverage.verified_usd_executions > 0 && <p className="mt-1 text-xs text-emerald-800">Todas las llamadas de proveedor de esta página tienen precio verificado en USD.</p>}
                    {latestPage.cost_coverage.unpriced_executions === 0 && latestPage.cost_coverage.verified_usd_executions === 0 && <p className="mt-1 text-xs text-ink-muted">Esta página no contiene llamadas de proveedor con costo contabilizable.</p>}
                  </>
                ) : (
                  <p role="status" className="mt-1 text-amber-800">El servicio no informó la cobertura de esta página; no se puede confirmar que los importes ausentes sean cero.</p>
                )}
              </div>
              <p className="max-w-md text-xs leading-5 text-ink-muted">El conteo corresponde únicamente a los eventos de esta página, no a todo el historial filtrado.</p>
            </div>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,.8fr)]" aria-label="Eventos de trazabilidad">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
              <div><h2 className="font-semibold text-ink">Eventos</h2><p className="mt-0.5 text-xs text-ink-muted">{items.length ? `Mostrando ${items.length} eventos` : 'Los eventos más recientes aparecerán aquí.'}</p></div>
              {history.isValidating && <Badge color="blue">Actualizando</Badge>}
            </div>

            {history.error ? (
              <div role="alert" className="p-5 text-sm text-rose-700">No se pudieron cargar las trazas. Revisa el ámbito o vuelve a intentarlo.<div className="mt-3"><Button outline onClick={() => void history.mutate()}>Reintentar</Button></div></div>
            ) : history.isLoading ? (
              <div role="status" className="p-8 text-center text-sm text-ink-muted">Cargando eventos autorizados…</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center"><p className="font-medium text-ink">No hay eventos para estos filtros</p><p className="mt-1 text-sm text-ink-secondary">Ajusta el periodo o quita algún filtro.</p></div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const active = item.id === selectedId
                  return (
                    <button key={`${item.kind}:${item.id}`} type="button" aria-pressed={active} onClick={() => setSelectedId(item.id)} className={`grid w-full gap-3 px-4 py-4 text-left transition hover:bg-surface-soft sm:grid-cols-[minmax(0,1.15fr)_minmax(8rem,.7fr)_minmax(6rem,.45fr)_minmax(8rem,.65fr)_auto] sm:items-center sm:px-5 ${active ? 'bg-(--tenant-accent)/5 ring-1 ring-inset ring-(--tenant-accent)/20' : ''}`}>
                      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{item.tool || eventLabel(item)}</span><Badge color={statusColor(item.status)}>{safeStatus(item.status)}</Badge></span><span className="mt-1 block truncate text-xs text-ink-secondary">{item.project_name ?? item.project_id ?? 'Sin proyecto'}{item.epic_title ? ` · ${item.epic_title}` : ''}{item.work_item_title ? ` · ${item.work_item_title}` : ''}</span></span>
                      <span className="text-xs text-ink-secondary">{traceActorLabel(item, agentNames)}<span className="mt-1 block text-ink-muted">{item.step_key ? `Paso ${item.step_key}` : item.operation ?? '—'}</span></span>
                      <span className="text-xs font-medium text-ink">{displayEventCost(item)}<span className="mt-1 block font-normal text-ink-muted">Costo</span></span>
                      <span className="text-xs text-ink-secondary">{displayTime(item.occurred_at)}<span className="mt-1 block text-ink-muted">{item.provider && item.model ? `${item.provider} · ${item.model}` : item.provider ?? '—'}</span></span>
                      <ArrowRightIcon aria-hidden="true" className="hidden size-4 text-ink-muted sm:block" />
                    </button>
                  )
                })}
              </div>
            )}

            {hasMore && <div className="border-t border-border-subtle p-4 text-center"><Button outline disabled={history.isValidating} onClick={() => void history.setSize(history.size + 1)}>Cargar más eventos</Button></div>}
          </div>

          <aside aria-label="Detalle del evento seleccionado" className="min-w-0 rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-ink-muted">Detalle de evento</p><h2 className="mt-1 break-words text-lg font-semibold text-ink">{selected.tool || eventLabel(selected)}</h2></div><Badge color={statusColor(selected.status)}>{safeStatus(selected.status)}</Badge></div>
                {selected.summary && <p className="mt-4 rounded-xl bg-surface-soft p-3 text-sm leading-6 text-ink-secondary">{selected.summary.slice(0, 512)}</p>}
                <dl className="mt-4 divide-y divide-border-subtle text-sm">
                  <DetailRow label="Fecha" value={displayTime(selected.occurred_at)} />
                  <DetailRow label="Tipo de evento" value={eventLabel(selected)} />
                  <DetailRow label="ID de evento" value={<TraceIdentifier value={selected.id} />} />
                  {selected.automation_task_id && <DetailRow label="ID de tarea (workflow)" value={<TraceIdentifier value={selected.automation_task_id} />} />}
                  {selected.run_id && <DetailRow label="Run ID" value={<TraceIdentifier value={selected.run_id} />} />}
                  {selected.kind === 'gate_decision' && <DetailRow label="Etapa de revisión" value={traceEventTypeLabel(selected.event_type)} />}
                  {selected.kind === 'assignment_event' && selected.event_type && <DetailRow label="Tipo de asignación" value={traceEventTypeLabel(selected.event_type)} />}
                  {selected.kind === 'assignment_event' && selected.previous_status != null && selected.previous_status !== '' && selected.status && <DetailRow label="Cambio de estado" value={`${safeStatus(selected.previous_status)} → ${safeStatus(selected.status)}`} />}
                  {selected.kind === 'assignment_event' && selected.previous_agent_key != null && selected.previous_agent_key !== '' && <DetailRow label="Agente anterior" value={traceAgentLabel(selected.previous_agent_key, agentNames)} />}
                  {selected.kind === 'assignment_event' && selected.previous_machine_id != null && selected.previous_machine_id !== '' && <DetailRow label="Máquina anterior" value={selected.previous_machine_id.slice(0, 160)} />}
                  <DetailRow label="Agente" value={selected.kind === 'gate_decision' ? 'Humano' : selected.agent_key && selected.agent_key !== 'unknown' ? <Link className="text-(--tenant-accent) hover:underline" href={`/automation/agents/${encodeURIComponent(selected.agent_key)}`}>{traceAgentLabel(selected.agent_key, agentNames)}</Link> : traceAgentLabel(selected.agent_key, agentNames)} />
                  <DetailRow label="Cliente" value={selected.client_id ? <TraceContextLink href={`/automation/clients/${encodeURIComponent(selected.client_id)}`} kind="cliente" label={selected.client_name ?? selected.client_id} /> : selected.client_name} />
                  <DetailRow label="Proyecto" value={selected.project_id ? <TraceContextLink href={deliveryProjectPath(selected.project_id)} kind="proyecto" label={selected.project_name ?? selected.project_id} /> : selected.project_name} />
                  <DetailRow label="Épica" value={selected.epic_id ? <TraceContextLink href={deliveryEpicDetailPath(selected.epic_id)} kind="épica" label={selected.epic_title ?? selected.epic_id} /> : selected.epic_title} />
                  <DetailRow label="Tarea" value={selectedWorkItemHref ? <TraceContextLink href={selectedWorkItemHref} kind="tarea" label={selected.work_item_title ?? selected.work_item_id ?? 'Abrir tarea'} /> : selected.work_item_title} />
                  {selected.work_item_id && <DetailRow label="ID de tarea de proyecto" value={<TraceIdentifier value={selected.work_item_id} />} />}
                  <DetailRow label="Paso" value={selectedStepHref ? <TraceContextLink href={selectedStepHref} kind="paso" label={selected.step_key ?? selected.step_id ?? 'Abrir paso'} /> : selected.step_key ?? selected.step_id} />
                  {selected.step_id && <DetailRow label="ID de paso" value={<TraceIdentifier value={selected.step_id} />} />}
                  <DetailRow label="Worker / máquina" value={[selected.worker_id, selected.machine_id].filter(Boolean).join(' · ')} />
                  <DetailRow label="ID de instancia" value={selected.agent_instance_id && <TraceIdentifier value={selected.agent_instance_id} />} />
                  <DetailRow label="Operación" value={selected.operation} />
                  <DetailRow label="Proveedor / modelo" value={[selected.provider, selected.model].filter(Boolean).join(' · ')} />
                  <DetailRow label="Tokens (entrada / salida)" value={selected.input_tokens == null && selected.output_tokens == null ? '—' : `${selected.input_tokens == null ? '—' : displayCount(selected.input_tokens)} / ${selected.output_tokens == null ? '—' : displayCount(selected.output_tokens)}`} />
                  {hasTraceField(selected, 'cached_input_tokens') && <DetailRow label="Tokens de entrada en caché" value={selected.cached_input_tokens == null ? '—' : displayCount(selected.cached_input_tokens)} />}
                  {hasTraceField(selected, 'cache_write_tokens') && <DetailRow label="Tokens escritos en caché" value={selected.cache_write_tokens == null ? '—' : displayCount(selected.cache_write_tokens)} />}
                  {hasTraceField(selected, 'latency_ms') && <DetailRow label="Latencia" value={selected.latency_ms == null ? '—' : `${displayCount(selected.latency_ms)} ms`} />}
                  <DetailRow label="Costo registrado" value={displayEventCost(selected)} />
                </dl>
                <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">La vista solo muestra metadatos aprobados. No conserva ni revela prompts, salida del modelo, secretos o razonamiento privado.</p>
              </>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center text-center"><ClipboardDocumentListIcon className="size-8 text-ink-muted" /><h2 className="mt-3 font-semibold text-ink">Selecciona un evento</h2><p className="mt-1 max-w-xs text-sm text-ink-secondary">Aquí verás su contexto, estado, proveedor y coste usando únicamente campos aprobados.</p></div>
            )}
          </aside>
        </section>
      </main>
    </PageTransition>
  )
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(7rem,.75fr)_minmax(0,1fr)] gap-3 py-2.5"><dt className="text-xs text-ink-muted">{label}</dt><dd className="min-w-0 break-words text-right text-xs font-medium text-ink">{value || '—'}</dd></div>
}

function TraceIdentifier({ value }: { value: string }) {
  return <code className="select-all break-all rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[11px]">{value}</code>
}

function TraceContextLink({ href, kind, label }: { href: string; kind: string; label: string }) {
  return <Link aria-label={`Abrir ${kind}: ${label}`} className="inline-flex max-w-full items-center justify-end gap-1 text-(--tenant-accent) hover:underline" href={href}><span className="break-words">{label}</span><ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0" /></Link>
}
