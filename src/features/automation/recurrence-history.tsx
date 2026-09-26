'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { deliveryWorkItemPath } from '@/lib/api-paths'
import { ArrowPathIcon, CalendarDaysIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type {
  RecurrenceScheduleEvent,
  RecurrenceScheduleOccurrence,
} from './recurrence-schedules'
import { recurrenceScheduleEventLabel, recurrenceScheduleFailureLabel } from './recurrence-schedules'
import { useRecurrenceHistory, type RecurrenceHistoryListState } from './use-recurrence-history'

function dateTime(value: string, timeZone?: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }
}

function occurrenceStatus(status: RecurrenceScheduleOccurrence['status']) {
  if (status === 'materialized') return { label: 'Trabajo creado', color: 'blue' as const }
  if (status === 'blocked') return { label: 'Bloqueada', color: 'amber' as const }
  return { label: 'Omitida', color: 'zinc' as const }
}

function WorkItemLink({ workItemID }: { workItemID: string }) {
  return (
    <Link
      href={deliveryWorkItemPath(workItemID)}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg font-semibold text-(--tenant-accent) hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
    >
      <DocumentTextIcon className="size-4" aria-hidden="true" />
      Abrir tarea en Planeación
    </Link>
  )
}

function HistoryList<Item>({
  title,
  icon,
  state,
  emptyMessage,
  renderItem,
}: {
  title: string
  icon: ReactNode
  state: RecurrenceHistoryListState<Item>
  emptyMessage: string
  renderItem: (item: Item) => ReactNode
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border-subtle bg-surface-raised" aria-label={title}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border-subtle px-3 py-2.5 sm:px-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">{icon}{title}</h4>
        <span className="text-xs tabular-nums text-ink-muted">{state.items.length}</span>
      </header>
      <div className="space-y-2 p-3 sm:p-4">
        {state.error && state.items.length === 0 ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
            No se pudo cargar este historial autorizado. Revisa tu acceso al proyecto e inténtalo de nuevo.
            <Button plain type="button" onClick={state.refresh} className="ml-2 font-semibold underline">Reintentar</Button>
          </div>
        ) : state.isLoading && state.items.length === 0 ? (
          <p role="status" className="rounded-lg bg-surface-soft p-3 text-xs text-ink-muted">Cargando {title.toLocaleLowerCase('es-MX')}…</p>
        ) : state.items.length === 0 ? (
          <p className="rounded-lg bg-surface-soft p-3 text-xs leading-5 text-ink-muted">{emptyMessage}</p>
        ) : (
          <>
            {state.error ? <p role="status" className="text-xs text-amber-800">No se pudo actualizar; se conserva el historial ya cargado.</p> : null}
            <ol className="space-y-2">{state.items.map((item) => renderItem(item))}</ol>
          </>
        )}
        {state.offsetLimitReached ? (
          <p role="status" className="text-xs leading-5 text-ink-muted">El API alcanzó el máximo de offset consultable; quedan registros fuera de esta ventana.</p>
        ) : null}
        {state.hasMore ? (
          <div className="flex justify-center pt-1">
            <Button outline type="button" onClick={state.loadMore} disabled={state.isValidating}>
              {state.isValidating ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function OccurrenceRow({ occurrence }: { occurrence: RecurrenceScheduleOccurrence }) {
  const status = occurrenceStatus(occurrence.status)
  return (
    <li key={occurrence.id} className="rounded-xl border border-border-subtle bg-surface-soft/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">Programada: {dateTime(occurrence.scheduled_for, occurrence.time_zone)}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Hora local {occurrence.local_occurrence} · {occurrence.time_zone} · revisión v{occurrence.schedule_revision}</p>
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        <div><dt className="inline text-ink-muted">Registrada: </dt><dd className="inline text-ink-secondary">{dateTime(occurrence.created_at)}</dd></div>
        {occurrence.materialized_at ? <div><dt className="inline text-ink-muted">Trabajo creado: </dt><dd className="inline text-ink-secondary">{dateTime(occurrence.materialized_at)}</dd></div> : null}
      </dl>
      {occurrence.failure_code ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-950">
          Motivo: {recurrenceScheduleFailureLabel(occurrence.failure_code)} <code className="font-mono">({occurrence.failure_code})</code>
        </p>
      ) : null}
      {occurrence.work_item_id ? <div className="mt-2"><WorkItemLink workItemID={occurrence.work_item_id} /></div> : null}
    </li>
  )
}

function EventRow({ event }: { event: RecurrenceScheduleEvent }) {
  return (
    <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border-subtle bg-surface-soft/45 p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink">{recurrenceScheduleEventLabel(event.event_type)}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted"><ClockIcon className="size-3.5" aria-hidden="true" />{dateTime(event.occurred_at)}</p>
      </div>
      {event.work_item_id ? <WorkItemLink workItemID={event.work_item_id} /> : null}
    </li>
  )
}

export function RecurrenceHistoryPanel({ projectID, scheduleID }: { projectID: string; scheduleID: string }) {
  const history = useRecurrenceHistory(projectID, scheduleID)
  const isRefreshing = history.occurrences.isValidating || history.events.isValidating

  return (
    <section className="mt-4 border-t border-border-subtle pt-4" aria-label="Historial de ocurrencias y eventos">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-(--tenant-accent)/10 text-(--tenant-accent)"><CalendarDaysIcon className="size-4" aria-hidden="true" /></span>
          <div><h3 className="text-sm font-semibold text-ink">Historial de ocurrencias</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">Cuando se materializa, una ocurrencia crea una tarea en Planeación. Eso no significa que un agente la haya ejecutado o completado; siguen vigentes la revisión humana y los gates del flujo.</p></div>
        </div>
        <Button outline type="button" onClick={() => { history.occurrences.refresh(); history.events.refresh() }} disabled={isRefreshing}>
          <ArrowPathIcon data-slot="icon" className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
          Actualizar historial
        </Button>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <HistoryList
          title="Ocurrencias"
          icon={<CalendarDaysIcon className="size-4 text-ink-muted" aria-hidden="true" />}
          state={history.occurrences}
          emptyMessage="Esta recurrencia todavía no ha registrado ocurrencias."
          renderItem={(occurrence) => <OccurrenceRow key={occurrence.id} occurrence={occurrence} />}
        />
        <HistoryList
          title="Eventos de la recurrencia"
          icon={<ClockIcon className="size-4 text-ink-muted" aria-hidden="true" />}
          state={history.events}
          emptyMessage="Todavía no hay cambios o eventos para esta recurrencia."
          renderItem={(event) => <EventRow key={event.id} event={event} />}
        />
      </div>
    </section>
  )
}
