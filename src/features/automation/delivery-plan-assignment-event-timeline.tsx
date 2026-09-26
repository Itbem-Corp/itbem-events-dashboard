'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { useId, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import {
  DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE,
  DELIVERY_PLAN_ASSIGNMENT_STATUSES,
  deliveryPlanAssignmentEventsPath,
  parseDeliveryPlanAssignmentEvents,
  type DeliveryPlanAssignmentEvent,
  type DeliveryPlanAssignmentEventFilters,
  type DeliveryPlanAssignmentEventsPage,
} from './delivery-plan-assignment-events'

type FilterForm = Required<DeliveryPlanAssignmentEventFilters>

const emptyFilters: FilterForm = {
  step_id: '',
  assignment_id: '',
  task_id: '',
  status: '',
  agent_key: '',
  machine_id: '',
}

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const eventLabels: Record<DeliveryPlanAssignmentEvent['event_type'], string> = {
  assignment_created: 'Asignación creada',
  status_changed: 'Estado actualizado',
  target_changed: 'Destino actualizado',
  status_and_target_changed: 'Estado y destino actualizados',
}

const statusLabels: Record<(typeof DELIVERY_PLAN_ASSIGNMENT_STATUSES)[number], string> = {
  pending: 'Pendiente',
  queued: 'En cola',
  dispatched: 'Enviada',
  running: 'En curso',
  blocked: 'Bloqueada',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
}

function dateTime(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Sin fecha válida'
    : parsed.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function statusText(value: string) {
  if (!value) return '—'
  return statusLabels[value as keyof typeof statusLabels] ?? value
}

function targetText(agentKey: string, machineId: string) {
  const parts = [agentKey, machineId].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Sin destino asignado'
}

function AssignmentEventCard({ event }: { event: DeliveryPlanAssignmentEvent }) {
  return (
    <li className="min-w-0 rounded-xl border border-border-subtle bg-surface-soft p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={event.status === 'completed' ? 'emerald' : event.status === 'failed' || event.status === 'blocked' ? 'rose' : 'zinc'}>
            {eventLabels[event.event_type]}
          </Badge>
          <span className="text-xs font-medium text-ink-secondary">{statusText(event.status)}</span>
        </div>
        <time className="text-[11px] text-ink-muted" dateTime={event.occurred_at}>{dateTime(event.occurred_at)}</time>
      </div>
      <dl className="mt-3 grid min-w-0 gap-x-4 gap-y-2 text-[11px] text-ink-muted sm:grid-cols-2">
        <div className="min-w-0">
          <dt>Registro</dt>
          <dd className="break-all text-ink-secondary">{event.id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Asignación</dt>
          <dd className="break-all text-ink-secondary">{event.assignment_id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Ejecución</dt>
          <dd className="break-all text-ink-secondary">{event.execution_id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Paso</dt>
          <dd className="break-all text-ink-secondary">{event.step_id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Tarea de la asignación</dt>
          <dd className="break-all text-ink-secondary">{event.task_id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Tarea padre</dt>
          <dd className="break-all text-ink-secondary">{event.parent_task_id}</dd>
        </div>
        <div className="min-w-0">
          <dt>Estado anterior</dt>
          <dd className="text-ink-secondary">{statusText(event.previous_status)}</dd>
        </div>
        <div className="min-w-0">
          <dt>Destino anterior</dt>
          <dd className="break-all text-ink-secondary">{targetText(event.previous_target_agent_key, event.previous_target_machine_id)}</dd>
        </div>
        <div className="min-w-0">
          <dt>Destino actual</dt>
          <dd className="break-all text-ink-secondary">{targetText(event.target_agent_key, event.target_machine_id)}</dd>
        </div>
      </dl>
    </li>
  )
}

export function DeliveryPlanAssignmentEventTimeline({
  planId,
  planVersion,
}: {
  planId: string
  planVersion: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<FilterForm>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<DeliveryPlanAssignmentEventFilters>({})
  const [filterError, setFilterError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const panelId = useId()

  const path = isOpen ? deliveryPlanAssignmentEventsPath(planId, cursor, appliedFilters) : null
  const { data, error, isLoading, isValidating, mutate } = useSWR<DeliveryPlanAssignmentEventsPage>(
    path,
    async (key) => parseDeliveryPlanAssignmentEvents(await fetcher<unknown>(key), { planId, planVersion }),
    { dedupingInterval: 5_000, revalidateOnFocus: true },
  )

  function updateDraft(field: keyof FilterForm, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalidUUID = (['step_id', 'assignment_id', 'task_id', 'machine_id'] as const)
      .find((key) => draftFilters[key].trim() && !uuidPattern.test(draftFilters[key].trim()))
    if (invalidUUID) {
      const fieldLabels = {
        step_id: 'el ID del paso',
        assignment_id: 'el ID de la asignación',
        task_id: 'el ID de la tarea',
        machine_id: 'el ID del equipo',
      }
      setFilterError(`${fieldLabels[invalidUUID]} debe ser un UUID válido.`)
      return
    }

    setFilterError('')
    setCursor(null)
    setCursorHistory([])
    setAppliedFilters(Object.fromEntries(
      Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value),
    ) as DeliveryPlanAssignmentEventFilters)
  }

  function clearFilters() {
    setDraftFilters(emptyFilters)
    setAppliedFilters({})
    setFilterError('')
    setCursor(null)
    setCursorHistory([])
  }

  function goToNextPage() {
    if (!data?.next_cursor) return
    setCursorHistory((history) => [...history, cursor])
    setCursor(data.next_cursor)
  }

  function goToPreviousPage() {
    if (cursorHistory.length === 0) return
    setCursor(cursorHistory[cursorHistory.length - 1])
    setCursorHistory((history) => history.slice(0, -1))
  }

  return (
    <section className="mt-5 rounded-2xl border border-border-subtle bg-surface-soft p-4 sm:p-5" aria-label="Historial de asignaciones del plan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Historial de asignaciones</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">
            Cambios de estado y destino de los pasos de este plan, registrados por el servidor. Este historial no incluye contenido de trabajo, prompts ni respuestas.
          </p>
        </div>
        <Button
          outline
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Ocultar historial' : 'Ver historial de asignaciones'}
        </Button>
      </div>

      {isOpen ? (
        <div id={panelId} className="mt-4 border-t border-border-subtle pt-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submitFilters} aria-label="Filtrar historial de asignaciones">
            {([
              ['step_id', 'ID del paso'],
              ['assignment_id', 'ID de asignación'],
              ['task_id', 'ID de tarea'],
              ['agent_key', 'Clave de agente'],
              ['machine_id', 'ID del equipo'],
            ] as const).map(([field, label]) => (
              <label key={field} className="block text-xs font-medium text-ink-secondary">
                {label}
                <input
                  type="text"
                  value={draftFilters[field]}
                  onChange={(event) => updateDraft(field, event.target.value)}
                  autoComplete="off"
                  maxLength={field === 'agent_key' ? 64 : 36}
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-(--tenant-accent) focus:outline-none focus:ring-2 focus:ring-(--tenant-accent)/20"
                />
              </label>
            ))}
            <label className="block text-xs font-medium text-ink-secondary">
              Estado
              <select
                value={draftFilters.status}
                onChange={(event) => updateDraft('status', event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-xs text-ink focus:border-(--tenant-accent) focus:outline-none focus:ring-2 focus:ring-(--tenant-accent)/20"
              >
                <option value="">Todos</option>
                {DELIVERY_PLAN_ASSIGNMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={isValidating}>{isValidating ? 'Aplicando…' : 'Aplicar filtros'}</Button>
              <Button outline type="button" onClick={clearFilters} disabled={isValidating}>Limpiar filtros</Button>
            </div>
          </form>

          {filterError ? <p role="alert" className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[.045] px-3 py-2 text-xs text-rose-800 dark:text-rose-200">{filterError}</p> : null}
          {isLoading && !data ? <p role="status" aria-live="polite" className="mt-4 text-xs text-ink-muted">Cargando historial de asignaciones…</p> : null}
          {error ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[.045] p-3">
              <p className="text-xs leading-5 text-rose-800 dark:text-rose-200">{getApiErrorMessage(error, 'No se pudo cargar el historial de asignaciones.')}</p>
              <Button outline type="button" onClick={() => void mutate()} disabled={isValidating}>{isValidating ? 'Reintentando…' : 'Reintentar'}</Button>
            </div>
          ) : null}
          {data && data.items.length === 0 && !error ? (
            <p role="status" aria-label="Historial de asignaciones vacío" className="mt-4 rounded-xl border border-dashed border-border-subtle px-3 py-4 text-xs leading-5 text-ink-muted">
              No hay movimientos para este plan con los filtros seleccionados.
            </p>
          ) : null}
          {data && data.items.length > 0 ? (
            <>
              <ol aria-label="Movimientos de asignación" className="mt-4 grid gap-2">
                {data.items.map((item) => <AssignmentEventCard key={item.id} event={item} />)}
              </ol>
              <nav aria-label="Paginación del historial de asignaciones" className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button outline type="button" onClick={goToPreviousPage} disabled={cursorHistory.length === 0 || isValidating}>
                  Página anterior
                </Button>
                <p role="status" aria-live="polite" className="text-[11px] text-ink-muted">
                  Página {cursorHistory.length + 1} · {data.items.length} {data.items.length === 1 ? 'movimiento' : 'movimientos'} · hasta {DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE} por página
                </p>
                <Button outline type="button" onClick={goToNextPage} disabled={!data.next_cursor || isValidating}>
                  Página siguiente
                </Button>
              </nav>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
