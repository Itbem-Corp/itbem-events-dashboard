'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { deliveryEpicDetailPath, deliveryProjectEpicsPagePath, type DeliveryEpicDetail, type DeliveryEpicListPage } from '@/features/automation/delivery-epics'
import { useEffect, useId, useState, type FormEvent } from 'react'
import useSWR from 'swr'

export const PROJECT_ACTIVITY_PAGE_SIZE = 25

export type ProjectActivityKind = 'step' | 'assignment' | 'activity'

export type ProjectActivityItem = {
  id: string
  kind: ProjectActivityKind
  event_type: string
  action?: string
  phase?: string
  tool_name?: string
  from_status?: string
  to_status?: string
  summary: string
  client_id: string
  project_id: string
  epic_id?: string
  work_item_id: string
  plan_id: string
  plan_version: number
  step_id: string
  automation_task_id: string
  run_id?: string
  worker_id?: string
  agent_key?: string
  machine_id?: string
  agent_instance_id?: string
  target_agent_key?: string
  previous_target_agent_key?: string
  target_machine_id?: string
  previous_target_machine_id?: string
  occurred_at: string
}

export type ProjectActivityPage = {
  project_id: string
  items: ProjectActivityItem[]
  next_cursor: string | null
}

export type ProjectActivityFilters = Partial<Record<
  'epic_id' | 'work_item_id' | 'agent_key' | 'agent_instance_id' | 'worker_id' | 'machine_id' | 'run_id' | 'kind' | 'action' | 'status' | 'from' | 'to',
  string
>>

const filterFields = [
  ['agent_key', 'Agente'],
  ['agent_instance_id', 'Instancia del agente'],
  ['worker_id', 'Worker'],
  ['machine_id', 'Equipo'],
  ['run_id', 'Ejecución'],
] as const

const projectActivityActions = [
  ['inference', 'Inferencia'],
  ['tool', 'Herramienta'],
  ['file_read', 'Lectura de archivo'],
  ['file_change', 'Cambio de archivo'],
  ['command', 'Comando'],
  ['validation', 'Validación'],
  ['evidence', 'Evidencia'],
  ['step_ready', 'Paso listo'],
  ['step_claimed', 'Paso reclamado'],
  ['lease_reclaimed', 'Lease recuperado'],
  ['lease_renewed', 'Lease renovado'],
  ['status_transitioned', 'Estado del paso actualizado'],
  ['assignment_created', 'Asignación creada'],
  ['status_changed', 'Estado de asignación actualizado'],
  ['target_changed', 'Destino de asignación actualizado'],
  ['status_and_target_changed', 'Estado y destino actualizados'],
] as const

const projectActivityStatuses = [
  'planned', 'ready', 'running', 'blocked', 'completed', 'failed', 'skipped',
  'pending', 'queued', 'dispatched', 'cancelled', 'started',
] as const

const uuidFilterFields = new Set(['epic_id', 'work_item_id', 'agent_instance_id', 'worker_id', 'machine_id', 'run_id'])
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`La actividad contiene un campo ${field} inválido.`)
  return value
}

function optionalString(source: Record<string, unknown>, key: keyof ProjectActivityItem): string | undefined {
  const value = source[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`La actividad contiene un campo ${key} inválido.`)
  return value
}

function parseActivityItem(value: unknown, projectId: string): ProjectActivityItem {
  if (!isRecord(value)) throw new Error('La actividad tiene un formato no compatible.')
  if (value.kind !== 'step' && value.kind !== 'assignment' && value.kind !== 'activity') {
    throw new Error('La actividad contiene un tipo de movimiento no compatible.')
  }
  if (value.project_id !== projectId) throw new Error('La actividad recibida no corresponde a este proyecto.')
  if (typeof value.plan_version !== 'number' || !Number.isInteger(value.plan_version) || value.plan_version < 1) {
    throw new Error('La actividad contiene una versión de plan inválida.')
  }

  // Explicitly construct the UI DTO. Unknown response keys (including any accidental
  // reasoning, prompt, payload or tool output fields) are never passed to the view.
  return {
    id: requiredString(value.id, 'id'),
    kind: value.kind,
    event_type: requiredString(value.event_type, 'event_type'),
    action: optionalString(value, 'action'),
    phase: optionalString(value, 'phase'),
    tool_name: optionalString(value, 'tool_name'),
    from_status: optionalString(value, 'from_status'),
    to_status: optionalString(value, 'to_status'),
    summary: requiredString(value.summary, 'summary'),
    client_id: requiredString(value.client_id, 'client_id'),
    project_id: projectId,
    epic_id: optionalString(value, 'epic_id'),
    work_item_id: requiredString(value.work_item_id, 'work_item_id'),
    plan_id: requiredString(value.plan_id, 'plan_id'),
    plan_version: value.plan_version,
    step_id: requiredString(value.step_id, 'step_id'),
    automation_task_id: requiredString(value.automation_task_id, 'automation_task_id'),
    run_id: optionalString(value, 'run_id'),
    worker_id: optionalString(value, 'worker_id'),
    agent_key: optionalString(value, 'agent_key'),
    machine_id: optionalString(value, 'machine_id'),
    agent_instance_id: optionalString(value, 'agent_instance_id'),
    target_agent_key: optionalString(value, 'target_agent_key'),
    previous_target_agent_key: optionalString(value, 'previous_target_agent_key'),
    target_machine_id: optionalString(value, 'target_machine_id'),
    previous_target_machine_id: optionalString(value, 'previous_target_machine_id'),
    occurred_at: requiredString(value.occurred_at, 'occurred_at'),
  }
}

export function parseProjectActivityPage(value: unknown, expectedProjectId: string): ProjectActivityPage {
  const source = isRecord(value) && isRecord(value.data) && !Array.isArray(value.items) ? value.data : value
  if (!isRecord(source) || source.project_id !== expectedProjectId || !Array.isArray(source.items)) {
    throw new Error('La respuesta de actividad no corresponde a este proyecto.')
  }
  const nextCursor = source.next_cursor
  if (!(nextCursor === undefined || nextCursor === null || typeof nextCursor === 'string')) {
    throw new Error('La respuesta contiene un cursor de actividad inválido.')
  }
  return {
    project_id: expectedProjectId,
    items: source.items.map((item) => parseActivityItem(item, expectedProjectId)),
    next_cursor: typeof nextCursor === 'string' && nextCursor.length > 0 ? nextCursor : null,
  }
}

export function projectActivityPath(projectId: string, cursor: string | null, filters: ProjectActivityFilters = {}) {
  const query = new URLSearchParams({ limit: String(PROJECT_ACTIVITY_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  for (const key of [
    'epic_id', 'work_item_id', 'agent_key', 'agent_instance_id', 'worker_id', 'machine_id',
    'run_id', 'kind', 'action', 'status', 'from', 'to',
  ] as const) {
    const value = filters[key]?.trim()
    if (value) query.set(key, value)
  }
  return `/automation/projects/${encodeURIComponent(projectId)}/activity?${query.toString()}`
}

function displayDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function labelFromKey(value: string) {
  return value.replaceAll('_', ' ')
}

function kindLabel(value: ProjectActivityKind) {
  return value === 'step' ? 'Paso' : value === 'assignment' ? 'Asignación' : 'Actividad'
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    queued: 'En cola',
    dispatched: 'Enviada',
    running: 'En curso',
    blocked: 'Bloqueada',
    completed: 'Completada',
    failed: 'Fallida',
    cancelled: 'Cancelada',
  }
  return labels[value] ?? labelFromKey(value)
}

function ActivityCard({ item, workItemTitle }: { item: ProjectActivityItem; workItemTitle?: string }) {
  const statusText = item.from_status || item.to_status
    ? `${item.from_status ? statusLabel(item.from_status) : '—'} → ${item.to_status ? statusLabel(item.to_status) : '—'}`
    : null
  const agentText = [item.agent_key, item.agent_instance_id, item.worker_id].filter(Boolean).join(' · ')
  const previousTargetText = [item.previous_target_agent_key, item.previous_target_machine_id].filter(Boolean).join(' · ')
  const targetText = [item.target_agent_key, item.target_machine_id].filter(Boolean).join(' · ')
  const targetTransition = previousTargetText ? `${previousTargetText} → ${targetText || 'sin destino'}` : targetText

  return (
    <li className="min-w-0 rounded-2xl border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge color={item.to_status === 'failed' || item.to_status === 'blocked' ? 'rose' : item.to_status === 'completed' ? 'emerald' : 'zinc'}>
            {labelFromKey(item.event_type)}
          </Badge>
          <span className="text-xs font-medium text-ink-secondary">{kindLabel(item.kind)}</span>
          {item.action ? <span className="text-xs text-ink-muted">{labelFromKey(item.action)}</span> : null}
        </div>
        <time className="shrink-0 text-[11px] text-ink-muted" dateTime={item.occurred_at}>{displayDate(item.occurred_at)}</time>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{item.summary}</p>
      <dl className="mt-3 grid min-w-0 gap-x-5 gap-y-2 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-ink-muted">Tarea</dt>
          <dd className="mt-0.5 truncate font-medium text-ink">
            <a href={`/automation/work-items/${encodeURIComponent(item.work_item_id)}`} className="underline decoration-border-strong underline-offset-2 hover:text-(--tenant-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
              {workItemTitle || item.work_item_id}
            </a>
          </dd>
        </div>
        {item.epic_id ? <div className="min-w-0"><dt className="text-ink-muted">Épica</dt><dd className="mt-0.5 truncate text-ink-secondary">{item.epic_id}</dd></div> : null}
        <div><dt className="text-ink-muted">Plan</dt><dd className="mt-0.5 break-all text-ink-secondary">v{item.plan_version} · {item.plan_id}</dd></div>
        <div><dt className="text-ink-muted">Paso / tarea agente</dt><dd className="mt-0.5 break-all text-ink-secondary">{item.step_id} · {item.automation_task_id}</dd></div>
        {item.phase || item.tool_name ? <div><dt className="text-ink-muted">Fase / herramienta</dt><dd className="mt-0.5 break-words text-ink-secondary">{[item.phase && labelFromKey(item.phase), item.tool_name].filter(Boolean).join(' · ')}</dd></div> : null}
        {statusText ? <div><dt className="text-ink-muted">Estado</dt><dd className="mt-0.5 text-ink-secondary">{statusText}</dd></div> : null}
        {agentText ? <div className="min-w-0"><dt className="text-ink-muted">Agente / worker</dt><dd className="mt-0.5 break-all text-ink-secondary">{agentText}</dd></div> : null}
        {targetTransition ? <div className="min-w-0"><dt className="text-ink-muted">Destino</dt><dd className="mt-0.5 break-all text-ink-secondary">{targetTransition}</dd></div> : null}
        {item.run_id ? <div className="min-w-0"><dt className="text-ink-muted">Ejecución</dt><dd className="mt-0.5 break-all text-ink-secondary">{item.run_id}</dd></div> : null}
      </dl>
    </li>
  )
}

const emptyFilters: ProjectActivityFilters = {}

export function ProjectActivityTimeline({
  projectId,
  workItems,
  fixedEpicId,
}: {
  projectId: string
  workItems: Array<{ id: string; title: string }>
  fixedEpicId?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const fixedFilters = fixedEpicId ? { epic_id: fixedEpicId } : emptyFilters
  const [draftFilters, setDraftFilters] = useState<ProjectActivityFilters>(fixedFilters)
  const [appliedFilters, setAppliedFilters] = useState<ProjectActivityFilters>(fixedFilters)
  const [filterError, setFilterError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const panelId = useId()

  const path = isOpen
    ? projectActivityPath(projectId, cursor, { ...appliedFilters, ...(fixedEpicId ? { epic_id: fixedEpicId } : {}) })
    : null
  const { data, error, isLoading, isValidating, mutate } = useSWR<ProjectActivityPage>(
    path,
    async (key) => parseProjectActivityPage(await fetcher<unknown>(key), projectId),
    { dedupingInterval: 5_000, revalidateOnFocus: true, refreshInterval: 15_000 },
  )
  const epicsPath = isOpen && !fixedEpicId ? deliveryProjectEpicsPagePath(projectId, { limit: 100 }) : null
  const epics = useSWR<DeliveryEpicListPage>(epicsPath, fetcher)
  const selectedEpicId = draftFilters.epic_id ?? ''
  const epicDetailPath = isOpen && selectedEpicId && !fixedEpicId ? deliveryEpicDetailPath(selectedEpicId) : null
  const selectedEpic = useSWR<DeliveryEpicDetail>(epicDetailPath, fetcher)
  const workItemOptions = !fixedEpicId && selectedEpicId && selectedEpic.data?.epic.id === selectedEpicId
    ? selectedEpic.data.work_items.items
    : workItems

  useEffect(() => {
    const nextFilters = fixedEpicId ? { epic_id: fixedEpicId } : emptyFilters
    setDraftFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setCursor(null)
    setCursorHistory([])
    setFilterError('')
  }, [fixedEpicId])

  function updateFilter(key: keyof ProjectActivityFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value || undefined }))
    if (key === 'epic_id') setDraftFilters((current) => ({ ...current, work_item_id: undefined }))
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = Object.entries(draftFilters).find(([key, value]) => value && uuidFilterFields.has(key) && !uuidPattern.test(value.trim()))
    if (invalid) {
      setFilterError(`El identificador de ${invalid[0].replaceAll('_', ' ')} debe ser un UUID válido.`)
      return
    }
    setFilterError('')
    setCursor(null)
    setCursorHistory([])
    setAppliedFilters(Object.fromEntries(Object.entries(draftFilters).map(([key, value]) => {
      const trimmed = value?.trim()
      if (!trimmed) return [key, undefined]
      if ((key === 'from' || key === 'to') && trimmed) {
        const date = new Date(trimmed)
        return [key, Number.isNaN(date.getTime()) ? trimmed : date.toISOString()]
      }
      return [key, trimmed]
    }).filter(([, value]) => value)) as ProjectActivityFilters)
  }

  function clearFilters() {
    setDraftFilters(fixedFilters)
    setAppliedFilters(fixedFilters)
    setFilterError('')
    setCursor(null)
    setCursorHistory([])
  }

  function nextPage() {
    if (!data?.next_cursor) return
    setCursorHistory((history) => [...history, cursor])
    setCursor(data.next_cursor)
  }

  function previousPage() {
    if (!cursorHistory.length) return
    setCursor(cursorHistory[cursorHistory.length - 1])
    setCursorHistory((history) => history.slice(0, -1))
  }

  return (
    <section id="project-activity" className="premium-surface scroll-mt-20 mt-5 overflow-hidden rounded-3xl" aria-labelledby="project-activity-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Trazabilidad del proyecto</p>
          <h2 id="project-activity-title" className="mt-1 text-lg font-semibold text-ink">Actividad de agentes</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">{fixedEpicId ? 'Movimientos de las tareas de esta épica, con acceso a su detalle.' : 'Pasos, cambios de asignación y eventos operativos, con acceso directo a la tarea.'} No se muestran razonamientos privados ni payloads.</p>
        </div>
        <Button outline type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setIsOpen((open) => !open)}>
          {isOpen ? 'Ocultar actividad' : 'Ver actividad'}
        </Button>
      </div>

      {isOpen ? (
        <div id={panelId} className="p-4 sm:p-5">
          <form onSubmit={submitFilters} aria-label="Filtrar actividad del proyecto" className="grid gap-3 rounded-2xl border border-border-subtle bg-surface-soft p-4 sm:grid-cols-2 lg:grid-cols-3">
            {!fixedEpicId ? (
              <label className="block text-xs font-medium text-ink-secondary">
                Épica (puedes buscar por nombre o pegar su ID)
                <input type="text" list={`${panelId}-epics`} autoComplete="off" spellCheck={false} maxLength={36} value={draftFilters.epic_id ?? ''} onChange={(event) => updateFilter('epic_id', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink" />
                <datalist id={`${panelId}-epics`}>
                  {(epics.data?.items ?? []).map((epic) => <option key={epic.id} value={epic.id} label={epic.title} />)}
                </datalist>
                {epics.error ? <span className="mt-1 block text-[11px] text-amber-700">No fue posible cargar los nombres; aún puedes pegar el ID de la épica.</span> : null}
              </label>
            ) : <p className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-3 text-xs text-ink-secondary">Épica fijada para este historial</p>}
            <label className="block text-xs font-medium text-ink-secondary">
              Tarea (elige sugerencia o pega su ID)
              <input type="text" list={`${panelId}-work-items`} autoComplete="off" spellCheck={false} maxLength={36} value={draftFilters.work_item_id ?? ''} onChange={(event) => updateFilter('work_item_id', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink" />
              <datalist id={`${panelId}-work-items`}>
                {workItemOptions.map((workItem) => <option key={workItem.id} value={workItem.id} label={workItem.title} />)}
              </datalist>
              {selectedEpicId && selectedEpic.error ? <span className="mt-1 block text-[11px] text-amber-700">No fue posible cargar las tareas de esta épica.</span> : null}
            </label>
            <label className="block text-xs font-medium text-ink-secondary">
              Tipo de registro
              <select value={draftFilters.kind ?? ''} onChange={(event) => updateFilter('kind', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink">
                <option value="">Todos</option><option value="step">Pasos</option><option value="assignment">Asignaciones</option><option value="activity">Actividad</option>
              </select>
            </label>
            {filterFields.map(([key, label]) => <label key={key} className="block text-xs font-medium text-ink-secondary">{label}<input type="text" autoComplete="off" spellCheck={false} maxLength={key === 'agent_key' ? 64 : 36} value={draftFilters[key] ?? ''} onChange={(event) => updateFilter(key, event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink" /></label>)}
            <label className="block text-xs font-medium text-ink-secondary">Acción<select value={draftFilters.action ?? ''} onChange={(event) => updateFilter('action', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink"><option value="">Todos</option>{projectActivityActions.map(([action, label]) => <option key={action} value={action}>{label}</option>)}</select></label>
            <label className="block text-xs font-medium text-ink-secondary">Estado<select value={draftFilters.status ?? ''} onChange={(event) => updateFilter('status', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink"><option value="">Todos</option>{projectActivityStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="block text-xs font-medium text-ink-secondary">Desde<input type="datetime-local" value={draftFilters.from ?? ''} onChange={(event) => updateFilter('from', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink" /></label>
            <label className="block text-xs font-medium text-ink-secondary">Hasta<input type="datetime-local" value={draftFilters.to ?? ''} onChange={(event) => updateFilter('to', event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-xs text-ink" /></label>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button color="indigo" type="submit">Aplicar filtros</Button>
              <Button outline type="button" onClick={clearFilters}>Limpiar</Button>
              <span className="pb-2 text-xs text-ink-muted">El servidor limita cada página a {PROJECT_ACTIVITY_PAGE_SIZE} registros.</span>
            </div>
          </form>
          {filterError ? <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">{filterError}</p> : null}
          {isLoading && !data ? <p role="status" className="py-6 text-center text-sm text-ink-muted">Cargando actividad…</p> : null}
          {error ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-800 dark:text-rose-200"><span>{getApiErrorMessage(error, 'No se pudo cargar la actividad de este proyecto.')}</span><Button outline type="button" onClick={() => void mutate()}>Reintentar</Button></div> : null}
          {data && !error ? (
            <>
              {data.items.length ? <ol className="mt-4 space-y-3" aria-label="Eventos recientes del proyecto">{data.items.map((event) => <ActivityCard key={event.id} item={event} workItemTitle={workItems.find((item) => item.id === event.work_item_id)?.title} />)}</ol> : <p role="status" aria-label="Actividad del proyecto vacía" className="mt-4 rounded-2xl border border-dashed border-border-subtle p-7 text-center text-sm text-ink-muted">No hay movimientos para este proyecto con los filtros seleccionados.</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
                <p className="text-xs text-ink-muted">Página {cursorHistory.length + 1} · {data.items.length} movimientos{isValidating ? ' · actualizando' : ''}</p>
                <div className="flex gap-2"><Button outline type="button" disabled={!cursorHistory.length || isValidating} onClick={previousPage}>Anterior</Button><Button outline type="button" disabled={!data.next_cursor || isValidating} onClick={nextPage}>Siguiente</Button></div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
