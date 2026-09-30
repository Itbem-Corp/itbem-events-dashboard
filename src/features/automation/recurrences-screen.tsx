'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import type { DeliveryContextSource, DeliveryProject } from '@/features/automation/delivery-types'
import {
  parseCreatedRecurrenceSchedule,
  recurrenceFrequencyLabel,
  recurrenceScheduleActionPath,
  recurrenceScheduleCreateError,
  recurrenceSchedulesCollectionPath,
  recurrenceStatusLabel,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
  type RecurrenceScheduleCreateInput,
  type RecurrenceWeekday,
} from '@/features/automation/recurrence-schedules'
import { useRecurrenceSchedules } from '@/features/automation/use-recurrence-schedules'
import { RecurrenceHistoryPanel } from '@/features/automation/recurrence-history'
import { api } from '@/lib/api'
import { deliveryProjectPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@heroicons/react/20/solid'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'

type RecurrenceDraft = {
  name: string
  title: string
  description: string
  expectedOutcome: string
  contextSourceIDs: string[]
  primaryRepositorySourceID: string
  includedScope: string
  excludedScope: string
  acceptanceCriteria: string
  budgetUSD: string
  budgetAlertPercent: string
  maxConcurrency: string
  frequency: RecurrenceFrequency
  interval: string
  weekdays: RecurrenceWeekday[]
  monthDay: string
  localTime: string
  timeZone: string
  startsOn: string
  endsOn: string
}

type Feedback = { tone: 'success' | 'error' | 'info'; text: string }
type PendingAction = { scheduleID: string; action: 'pause' | 'resume' } | null

const EMPTY_PROJECTS: DeliveryProject[] = []
const WEEKDAYS: Array<{ key: RecurrenceWeekday; label: string }> = [
  { key: 'sun', label: 'Domingo' }, { key: 'mon', label: 'Lunes' }, { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' }, { key: 'thu', label: 'Jueves' }, { key: 'fri', label: 'Viernes' }, { key: 'sat', label: 'Sábado' },
]

function localDateToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function newDraft(): RecurrenceDraft {
  let timeZone = 'America/Mexico_City'
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone
  } catch {
    // Keep the explicit, safe default when the browser does not expose its zone.
  }
  return {
    name: '', title: '', description: '', expectedOutcome: '', contextSourceIDs: [], primaryRepositorySourceID: '',
    includedScope: '', excludedScope: '', acceptanceCriteria: '', budgetUSD: '0.05', budgetAlertPercent: '80',
    maxConcurrency: '1', frequency: 'weekly', interval: '1', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], monthDay: '1', localTime: '09:00',
    timeZone, startsOn: localDateToday(), endsOn: '',
  }
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function dateTime(value: string | null, timeZone: string) {
  if (!value) return 'Sin fecha programada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }
}

function projectErrorMessage(error: unknown) {
  const value = error as { status?: unknown; response?: { status?: unknown } } | null
  const status = typeof value?.response?.status === 'number' ? value.response.status : typeof value?.status === 'number' ? value.status : 0
  if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente y vuelve a intentar.'
  if (status === 403) return 'No tienes acceso al portafolio de proyectos de este espacio.'
  return 'No se pudieron cargar los proyectos autorizados. Vuelve a intentar.'
}

function statusColor(status: RecurrenceSchedule['status']): 'green' | 'amber' | 'zinc' {
  if (status === 'active') return 'green'
  if (status === 'paused') return 'amber'
  return 'zinc'
}

function fieldClassName() {
  return 'min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15'
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-xs font-medium text-ink-secondary"><span>{label}</span>{children}{hint && <span className="text-[11px] font-normal leading-4 text-ink-muted">{hint}</span>}</label>
}

function ScheduleCard({
  projectID,
  schedule,
  projectSources,
  pendingAction,
  onAction,
}: {
  projectID: string
  schedule: RecurrenceSchedule
  projectSources: DeliveryContextSource[]
  pendingAction: PendingAction
  onAction: (schedule: RecurrenceSchedule, action: 'pause' | 'resume') => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const sourceNames = new Map(projectSources.map((source) => [source.id, source.name]))
  const isMutating = pendingAction?.scheduleID === schedule.id
  const budget = (schedule.template.budget_microusd / 1_000_000).toLocaleString('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><CalendarDaysIcon className="size-5" /></span>
          <div className="min-w-0">
            <h3 className="break-words font-semibold text-ink">{schedule.name}</h3>
            <p className="mt-1 break-words text-sm text-ink-secondary">{schedule.template.title}</p>
            <p className="mt-1 text-xs text-ink-muted">Revisión v{schedule.revision} · {recurrenceFrequencyLabel(schedule.recurrence)} · {schedule.recurrence.local_time} ({schedule.recurrence.time_zone})</p>
          </div>
        </div>
        <div className="flex items-center gap-2"><Badge color={statusColor(schedule.status)}>{recurrenceStatusLabel(schedule.status)}</Badge>
          {schedule.status === 'active' && <Button outline disabled={Boolean(pendingAction)} onClick={() => onAction(schedule, 'pause')}><PauseIcon data-slot="icon" />{isMutating ? 'Pausando…' : 'Pausar'}</Button>}
          {schedule.status === 'paused' && <Button outline disabled={Boolean(pendingAction)} onClick={() => onAction(schedule, 'resume')}><PlayIcon data-slot="icon" />{isMutating ? 'Reanudando…' : 'Reanudar'}</Button>}
        </div>
      </div>

      <p className="mt-4 max-w-4xl text-sm leading-6 text-ink-secondary">{schedule.template.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-surface-soft p-3"><p className="text-xs text-ink-muted">Próxima ocurrencia</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink"><ClockIcon className="size-4 shrink-0 text-ink-muted" />{schedule.status === 'active' ? dateTime(schedule.next_run_local ?? schedule.next_run_at, schedule.recurrence.time_zone) : 'No se ejecutará mientras esté pausada'}</p></div>
        <div className="rounded-xl bg-surface-soft p-3"><p className="text-xs text-ink-muted">Última ocurrencia</p><p className="mt-1 text-sm font-medium text-ink">{dateTime(schedule.last_run_at, schedule.recurrence.time_zone)}</p></div>
        <div className="rounded-xl bg-surface-soft p-3"><p className="text-xs text-ink-muted">Límite de presupuesto por tarea</p><p className="mt-1 text-sm font-medium text-ink">{budget} USD · alerta al {schedule.template.budget_alert_percent}%</p></div>
        <div className="rounded-xl bg-surface-soft p-3"><p className="text-xs text-ink-muted">Contexto fijado</p><p className="mt-1 text-sm font-medium text-ink">{schedule.template.context_source_ids.length} fuente{schedule.template.context_source_ids.length === 1 ? '' : 's'} · {schedule.template.max_concurrency} carril{schedule.template.max_concurrency === 1 ? '' : 'es'}</p>
          {schedule.template.context_source_ids.length > 0 && <p className="mt-1 truncate text-xs text-ink-muted" title={schedule.template.context_source_ids.map((id) => sourceNames.get(id) ?? id).join(', ')}>{schedule.template.context_source_ids.map((id) => sourceNames.get(id) ?? 'Fuente del proyecto').join(', ')}</p>}
        </div>
      </div>
      <details className="mt-4 border-t border-border-subtle pt-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink-secondary">Detalles del plan programado</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><h4 className="font-semibold text-ink">Resultado esperado</h4><p className="mt-1 whitespace-pre-wrap leading-5">{schedule.template.expected_outcome}</p></div>
          <div><h4 className="font-semibold text-ink">Criterios de aceptación</h4>{schedule.template.acceptance_criteria.length ? <ul className="mt-1 list-inside list-disc space-y-1">{schedule.template.acceptance_criteria.map((criterion, index) => <li key={`${index}:${criterion}`}>{criterion}</li>)}</ul> : <p className="mt-1">Aún no se definieron criterios.</p>}</div>
          <div><h4 className="font-semibold text-ink">Incluye</h4>{schedule.template.included_scope.length ? <ul className="mt-1 list-inside list-disc space-y-1">{schedule.template.included_scope.map((scope, index) => <li key={`${index}:${scope}`}>{scope}</li>)}</ul> : <p className="mt-1">Sin alcance adicional.</p>}</div>
          <div><h4 className="font-semibold text-ink">Excluye</h4>{schedule.template.excluded_scope.length ? <ul className="mt-1 list-inside list-disc space-y-1">{schedule.template.excluded_scope.map((scope, index) => <li key={`${index}:${scope}`}>{scope}</li>)}</ul> : <p className="mt-1">Sin exclusiones declaradas.</p>}</div>
        </div>
      </details>
      <div className="mt-4 border-t border-border-subtle pt-3">
        <Button
          outline
          type="button"
          aria-expanded={historyOpen}
          aria-controls={`recurrence-history-${schedule.id}`}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <ClockIcon data-slot="icon" />{historyOpen ? 'Ocultar historial' : 'Ver historial'}
        </Button>
        <div id={`recurrence-history-${schedule.id}`} hidden={!historyOpen}>
          {historyOpen ? <RecurrenceHistoryPanel projectID={projectID} scheduleID={schedule.id} /> : null}
        </div>
      </div>
    </article>
  )
}

function ScheduleComposer({
  projectId,
  project,
  projectLoading,
  onCancel,
  onCreated,
}: {
  projectId: string
  project?: DeliveryProject
  projectLoading: boolean
  onCancel: () => void
  onCreated: (schedule: RecurrenceSchedule) => void
}) {
  const [draft, setDraft] = useState<RecurrenceDraft>(() => newDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const contextSources = project?.context ?? []
  const readySources = contextSources.filter((source) => source.status === 'ready')
  const repositorySources = readySources.filter((source) => source.kind === 'repository' && source.reference.startsWith('workspace://'))
  const update = <K extends keyof RecurrenceDraft>(key: K, value: RecurrenceDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const selectedContextIDs = useMemo(() => new Set(draft.contextSourceIDs), [draft.contextSourceIDs])

  function toggleContextSource(sourceID: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      contextSourceIDs: checked
        ? [...new Set([...current.contextSourceIDs, sourceID])]
        : current.contextSourceIDs.filter((id) => id !== sourceID),
      primaryRepositorySourceID: !checked && current.primaryRepositorySourceID === sourceID ? '' : current.primaryRepositorySourceID,
    }))
  }

  function choosePrimaryRepository(sourceID: string) {
    setDraft((current) => ({
      ...current,
      primaryRepositorySourceID: sourceID,
      contextSourceIDs: sourceID ? [...new Set([...current.contextSourceIDs, sourceID])] : current.contextSourceIDs,
    }))
  }

  function validateAndBuild(): RecurrenceScheduleCreateInput | null {
    const budget = Number(draft.budgetUSD)
    const budgetAlertPercent = Number(draft.budgetAlertPercent)
    const maxConcurrency = Number(draft.maxConcurrency)
    const interval = Number(draft.interval)
    if (!draft.name.trim() || !draft.title.trim() || !draft.description.trim() || !draft.expectedOutcome.trim()) {
      setError('Completa el nombre, título, descripción y resultado esperado del trabajo.')
      return null
    }
    if (!Number.isFinite(budget) || budget <= 0 || budget > 100_000 || Math.round(budget * 1_000_000) < 1 || !Number.isInteger(budgetAlertPercent) || budgetAlertPercent < 50 || budgetAlertPercent > 100) {
      setError('El presupuesto por ocurrencia debe ser mayor a cero y no superar 100,000 USD; la alerta debe estar entre 50 y 100%.')
      return null
    }
    const intervalMaximum = draft.frequency === 'daily' ? 365 : draft.frequency === 'weekly' ? 52 : 24
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8 || !Number.isInteger(interval) || interval < 1 || interval > intervalMaximum) {
      setError('La concurrencia debe estar entre 1 y 8; el intervalo debe ser un entero dentro del rango permitido.')
      return null
    }
    if (draft.contextSourceIDs.length === 0) {
      setError('Selecciona al menos una fuente de contexto lista para esta plantilla.')
      return null
    }
    if (draft.contextSourceIDs.some((id) => !readySources.some((source) => source.id === id))) {
      setError('Una fuente seleccionada ya no está lista. Actualiza el contexto del proyecto y vuelve a elegir las fuentes.')
      return null
    }
    if (draft.frequency === 'weekly' && draft.weekdays.length === 0) {
      setError('Selecciona al menos un día de la semana para esta frecuencia.')
      return null
    }
    const monthDay = Number(draft.monthDay)
    if (draft.frequency === 'monthly' && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) {
      setError('El día del mes debe ser un número entre 1 y 31.')
      return null
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startsOn) || (draft.endsOn && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endsOn) || draft.endsOn < draft.startsOn))) {
      setError('Revisa la fecha de inicio y que la fecha final no sea anterior.')
      return null
    }
    try {
      new Intl.DateTimeFormat('es-MX', { timeZone: draft.timeZone })
    } catch {
      setError('Escribe una zona horaria IANA válida, por ejemplo America/Mexico_City.')
      return null
    }
    if (!projectId || projectLoading) {
      setError('Espera a que el contexto del proyecto esté listo antes de guardar.')
      return null
    }

    setError('')
    return {
      name: draft.name.trim(),
      template: {
        title: draft.title.trim(),
        description: draft.description.trim(),
        expected_outcome: draft.expectedOutcome.trim(),
        context_source_ids: [...new Set([...draft.contextSourceIDs, ...(draft.primaryRepositorySourceID ? [draft.primaryRepositorySourceID] : [])])],
        ...(draft.primaryRepositorySourceID ? { primary_repository_source_id: draft.primaryRepositorySourceID } : {}),
        included_scope: splitLines(draft.includedScope),
        excluded_scope: splitLines(draft.excludedScope),
        acceptance_criteria: splitLines(draft.acceptanceCriteria),
        budget_microusd: Math.round(budget * 1_000_000),
        budget_alert_percent: budgetAlertPercent,
        max_concurrency: maxConcurrency,
      },
      recurrence: {
        frequency: draft.frequency,
        interval,
        ...(draft.frequency === 'weekly' ? { weekdays: [...new Set(draft.weekdays)] } : {}),
        ...(draft.frequency === 'monthly' ? { month_day: monthDay } : {}),
        local_time: draft.localTime,
        time_zone: draft.timeZone.trim(),
        starts_on: draft.startsOn,
        ...(draft.endsOn ? { ends_on: draft.endsOn } : {}),
        misfire_policy: 'coalesce',
      },
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const payload = validateAndBuild()
    if (!payload) return
    setSaving(true)
    setError('')
    try {
      const response = await api.post(recurrenceSchedulesCollectionPath(projectId), payload)
      const created = parseCreatedRecurrenceSchedule(response.data, projectId)
      onCreated(created)
    } catch (cause) {
      setError(recurrenceScheduleCreateError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-6" aria-labelledby="schedule-composer-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-ink-muted">Nueva regla</p><h2 id="schedule-composer-title" className="mt-1 text-lg font-semibold text-ink">Programar trabajo recurrente</h2><p className="mt-1 text-sm text-ink-secondary">La plantilla queda asociada a este proyecto y se enviará a Planeación en cada ocurrencia.</p></div><Button plain type="button" onClick={onCancel}>Cerrar</Button></div>
      <form className="mt-5 space-y-6" onSubmit={submit}>
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={saving}>
          <legend className="mb-3 text-sm font-semibold text-ink">Trabajo y contexto</legend>
          <FormField label="Nombre de la recurrencia"><input className={fieldClassName()} maxLength={180} required value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="Revisión semanal de dependencias" /></FormField>
          <FormField label="Título de la tarea que aparecerá en Planeación"><input className={fieldClassName()} maxLength={180} required value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="Revisar dependencias del proyecto" /></FormField>
          <FormField label="Descripción"><textarea className={`${fieldClassName()} min-h-20`} required value={draft.description} onChange={(event) => update('description', event.target.value)} /></FormField>
          <FormField label="Resultado esperado"><textarea className={`${fieldClassName()} min-h-20`} required value={draft.expectedOutcome} onChange={(event) => update('expectedOutcome', event.target.value)} /></FormField>
          <div className="sm:col-span-2"><FormField label="Fuentes de contexto del proyecto" hint="Selecciona al menos una fuente lista. Sólo se guardan los IDs elegidos; no pegues API keys ni credenciales.">
            {projectLoading ? <p role="status" className="rounded-xl bg-surface-soft p-3 text-xs text-ink-muted">Cargando contexto del proyecto…</p> : readySources.length ? <div className="grid gap-2 rounded-xl border border-border-subtle p-3 sm:grid-cols-2">{readySources.map((source) => <label key={source.id} className="flex min-w-0 items-start gap-2 text-xs text-ink-secondary"><input className="mt-0.5 accent-(--tenant-accent)" type="checkbox" checked={selectedContextIDs.has(source.id)} onChange={(event) => toggleContextSource(source.id, event.target.checked)} /><span className="min-w-0"><span className="block truncate font-medium text-ink">{source.name}</span><span className="capitalize text-ink-muted">{source.kind.replaceAll('_', ' ')} · listo</span></span></label>)}</div> : <p className="rounded-xl border border-dashed border-border-subtle p-3 text-xs text-ink-muted">Este proyecto todavía no tiene fuentes de contexto listas. Prepara al menos una fuente en la configuración del proyecto para programar recurrencias.</p>}
          </FormField></div>
          {repositorySources.length > 0 && <FormField label="Repositorio principal (opcional)" hint="Sólo aparecen repositorios locales disponibles. Al elegirlo, se incluye automáticamente como contexto."><select className={fieldClassName()} value={draft.primaryRepositorySourceID} onChange={(event) => choosePrimaryRepository(event.target.value)}><option value="">Usar el mapa del proyecto</option>{repositorySources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></FormField>}
          <FormField label="Incluye en el alcance" hint="Una línea por punto."><textarea className={`${fieldClassName()} min-h-20`} value={draft.includedScope} onChange={(event) => update('includedScope', event.target.value)} /></FormField>
          <FormField label="Excluye del alcance" hint="Una línea por punto."><textarea className={`${fieldClassName()} min-h-20`} value={draft.excludedScope} onChange={(event) => update('excludedScope', event.target.value)} /></FormField>
          <div className="sm:col-span-2"><FormField label="Criterios de aceptación" hint="Una condición verificable por línea."><textarea className={`${fieldClassName()} min-h-20`} value={draft.acceptanceCriteria} onChange={(event) => update('acceptanceCriteria', event.target.value)} /></FormField></div>
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-border-subtle p-4 sm:grid-cols-2 lg:grid-cols-4" disabled={saving}>
          <legend className="px-2 text-sm font-semibold text-ink">Calendario y límites</legend>
          <FormField label="Frecuencia"><select className={fieldClassName()} value={draft.frequency} onChange={(event) => update('frequency', event.target.value as RecurrenceFrequency)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></FormField>
          <FormField label={draft.frequency === 'daily' ? 'Cada cuántos días' : draft.frequency === 'weekly' ? 'Cada cuántas semanas' : 'Cada cuántos meses'}><input className={fieldClassName()} type="number" min="1" max={draft.frequency === 'daily' ? 365 : draft.frequency === 'weekly' ? 52 : 24} value={draft.interval} onChange={(event) => update('interval', event.target.value)} /></FormField>
          <FormField label="Hora local"><input className={fieldClassName()} type="time" required value={draft.localTime} onChange={(event) => update('localTime', event.target.value)} /></FormField>
          <FormField label="Zona horaria"><input className={fieldClassName()} required maxLength={128} value={draft.timeZone} onChange={(event) => update('timeZone', event.target.value)} placeholder="America/Mexico_City" /></FormField>
          {draft.frequency === 'weekly' && <fieldset className="sm:col-span-2 lg:col-span-4"><legend className="mb-2 text-xs font-medium text-ink-secondary">Días de la semana</legend><div className="flex flex-wrap gap-2">{WEEKDAYS.map(({ key, label }) => <label key={key} className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1.5 text-xs text-ink-secondary"><input type="checkbox" className="accent-(--tenant-accent)" checked={draft.weekdays.includes(key)} onChange={(event) => update('weekdays', event.target.checked ? [...draft.weekdays, key] : draft.weekdays.filter((value) => value !== key))} />{label}</label>)}</div></fieldset>}
          {draft.frequency === 'monthly' && <FormField label="Día del mes"><input className={fieldClassName()} type="number" min="1" max="31" value={draft.monthDay} onChange={(event) => update('monthDay', event.target.value)} /></FormField>}
          <FormField label="Iniciar el"><input className={fieldClassName()} type="date" required value={draft.startsOn} onChange={(event) => update('startsOn', event.target.value)} /></FormField>
          <FormField label="Finalizar el (opcional)"><input className={fieldClassName()} type="date" min={draft.startsOn} value={draft.endsOn} onChange={(event) => update('endsOn', event.target.value)} /></FormField>
          <FormField label="Presupuesto máximo por tarea (USD)"><input className={fieldClassName()} type="number" min="0.000001" max="100000" step="any" value={draft.budgetUSD} onChange={(event) => update('budgetUSD', event.target.value)} /></FormField>
          <FormField label="Aviso de presupuesto (%)"><input className={fieldClassName()} type="number" min="50" max="100" step="1" value={draft.budgetAlertPercent} onChange={(event) => update('budgetAlertPercent', event.target.value)} /></FormField>
          <FormField label="Concurrencia máxima"><input className={fieldClassName()} type="number" min="1" max="8" step="1" value={draft.maxConcurrency} onChange={(event) => update('maxConcurrency', event.target.value)} /></FormField>
          <p className="self-center text-xs text-ink-muted lg:col-span-3">Si se acumulan ocurrencias durante una interrupción, se consolidan según la política “coalesce”.</p>
        </fieldset>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2"><Button outline type="button" onClick={onCancel} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving || projectLoading || !projectId || !readySources.length || !selectedContextIDs.size}><PlusIcon data-slot="icon" />{saving ? 'Guardando en el servidor…' : 'Crear recurrencia'}</Button></div>
      </form>
    </section>
  )
}

export function AutomationRecurrencesScreen() {
  const projectsQuery = useSWR<DeliveryProject[]>(deliveryProjectsPath(), fetcher, { revalidateOnFocus: true, shouldRetryOnError: false })
  const projects = projectsQuery.data ?? EMPTY_PROJECTS
  const [requestedProjectID, setRequestedProjectID] = useState('')
  const selectedProjectID = projects.some((project) => project.id === requestedProjectID)
    ? requestedProjectID
    : projects[0]?.id ?? ''
  const selectedProject = projects.find((project) => project.id === selectedProjectID)
  const projectQuery = useSWR<DeliveryProject>(selectedProjectID ? deliveryProjectPath(selectedProjectID) : null, fetcher, { revalidateOnFocus: true, shouldRetryOnError: false })
  const schedulesQuery = useRecurrenceSchedules(selectedProjectID)
  const [composerOpen, setComposerOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const projectSources = projectQuery.data?.context ?? []

  async function changeStatus(schedule: RecurrenceSchedule, action: 'pause' | 'resume') {
    if (pendingAction) return
    setPendingAction({ scheduleID: schedule.id, action })
    setFeedback(null)
    let accepted = false
    try {
      await api.post(recurrenceScheduleActionPath(selectedProjectID, schedule.id, action), {})
      accepted = true
      await schedulesQuery.mutate()
      setFeedback({ tone: 'success', text: `El servidor aceptó la solicitud de ${action === 'pause' ? 'pausa' : 'reanudación'} y se volvió a consultar el estado.` })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: accepted
          ? 'El servidor aceptó la acción, pero no pude confirmar el estado actualizado. Recarga la lista antes de confiar en el estado mostrado.'
          : recurrenceScheduleCreateError(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function created(schedule: RecurrenceSchedule) {
    setComposerOpen(false)
    setFeedback({ tone: 'success', text: `El servidor creó “${schedule.name}” como revisión v${schedule.revision}. Actualizando la lista desde el servidor.` })
    try {
      await schedulesQuery.mutate()
    } catch {
      setFeedback({ tone: 'info', text: `El servidor aceptó “${schedule.name}”, pero la lista no se pudo confirmar. Actualízala antes de volver a crearla.` })
    }
  }

  const activeCount = schedulesQuery.schedules.filter((schedule) => schedule.status === 'active').length
  const pausedCount = schedulesQuery.schedules.filter((schedule) => schedule.status === 'paused').length
  const endedCount = schedulesQuery.schedules.filter((schedule) => schedule.status === 'ended').length

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader
          eyebrow="Automatización · Planeación"
          title="Recurrentes"
          description="Programa solicitudes de trabajo por proyecto y conserva las revisiones humanas del flujo."
          icon={CalendarDaysIcon}
          actions={<div className="flex flex-wrap gap-2"><Button outline disabled={!selectedProjectID || projectsQuery.isLoading || Boolean(projectsQuery.error)} onClick={() => void schedulesQuery.mutate()}><ArrowPathIcon data-slot="icon" />Actualizar</Button><Button disabled={!selectedProjectID || projectsQuery.isLoading || Boolean(projectsQuery.error)} onClick={() => { setFeedback(null); setComposerOpen((open) => !open) }}><PlusIcon data-slot="icon" />Nueva recurrencia</Button></div>}
        />

        <section className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:p-5" aria-label="Límites de las recurrencias">
          <ShieldCheckIcon className="size-5 text-sky-700" />
          <div><h2 className="font-semibold">Cada ocurrencia crea trabajo en Planeación</h2><p className="mt-1 leading-6">La programación no aprueba un plan ni autoriza implementación automática. Los gates humanos siguen vigentes. Proveedor y asignación se resuelven con las políticas de routing existentes; no se seleccionan aquí.</p></div>
        </section>

        {projectsQuery.error ? (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900"><h2 className="font-semibold">No se pudieron cargar los proyectos</h2><p className="mt-1">{projectErrorMessage(projectsQuery.error)}</p><div className="mt-4"><Button outline onClick={() => void projectsQuery.mutate()}>Reintentar</Button></div></section>
        ) : projectsQuery.isLoading ? (
          <div role="status" className="rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center text-sm text-ink-muted">Cargando proyectos autorizados…</div>
        ) : projects.length === 0 ? (
          <section className="rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center"><CalendarDaysIcon className="mx-auto size-8 text-ink-muted" /><h2 className="mt-3 font-semibold text-ink">No hay proyectos disponibles</h2><p className="mx-auto mt-1 max-w-lg text-sm text-ink-secondary">Crea o habilita un proyecto antes de configurar trabajo recurrente.</p></section>
        ) : (
          <>
            <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
              <div className="min-w-0 flex-1"><label htmlFor="recurrence-project" className="text-xs font-medium text-ink-secondary">Proyecto</label><select id="recurrence-project" className={`${fieldClassName()} mt-1 max-w-2xl`} value={selectedProjectID} onChange={(event) => { setRequestedProjectID(event.target.value); setComposerOpen(false); setFeedback(null) }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.client?.name ? `${project.client.name} · ` : ''}{project.name}</option>)}</select></div>
              <div className="flex flex-wrap gap-2 text-xs"><Badge color="green">{activeCount} activas</Badge><Badge color="amber">{pausedCount} pausadas</Badge><Badge color="zinc">{endedCount} finalizadas</Badge></div>
            </section>

            {feedback && <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${feedback.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>{feedback.text}</p>}

            {composerOpen && selectedProjectID && <ScheduleComposer key={selectedProjectID} projectId={selectedProjectID} project={projectQuery.data} projectLoading={projectQuery.isLoading} onCancel={() => setComposerOpen(false)} onCreated={(schedule) => void created(schedule)} />}

            {projectQuery.error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">No se pudo cargar el contexto del proyecto. Recarga antes de elegir fuentes: {projectErrorMessage(projectQuery.error)}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted"><p>{schedulesQuery.schedules.length} recurrencias cargadas para {selectedProject?.name ?? 'el proyecto seleccionado'}</p>{schedulesQuery.isValidating && !schedulesQuery.isLoading && <Badge color="blue">Actualizando</Badge>}</div>

            {schedulesQuery.error ? (
              <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900"><div className="flex items-start gap-3"><ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" /><div><h2 className="font-semibold">No se pudieron cargar las recurrencias</h2><p className="mt-1">{recurrenceScheduleCreateError(schedulesQuery.error)}</p><div className="mt-4"><Button outline onClick={() => void schedulesQuery.mutate()}>Reintentar</Button></div></div></div></section>
            ) : schedulesQuery.isLoading ? (
              <div role="status" className="rounded-2xl border border-border-subtle bg-surface-raised p-10 text-center text-sm text-ink-muted">Cargando recurrencias autorizadas…</div>
            ) : schedulesQuery.schedules.length === 0 ? (
              <section className="rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center"><DocumentTextIcon className="mx-auto size-8 text-ink-muted" /><h2 className="mt-3 font-semibold text-ink">Este proyecto aún no tiene recurrencias</h2><p className="mx-auto mt-1 max-w-lg text-sm text-ink-secondary">Crea una plantilla de trabajo acotada. Cada fecha generará una nueva entrada en Planeación, sujeta a los gates humanos habituales.</p><div className="mt-4"><Button onClick={() => setComposerOpen(true)}><PlusIcon data-slot="icon" />Configurar la primera</Button></div></section>
            ) : (
              <div className="space-y-3">{schedulesQuery.schedules.map((schedule) => <ScheduleCard key={schedule.id} projectID={selectedProjectID} schedule={schedule} projectSources={projectSources} pendingAction={pendingAction} onAction={(item, action) => void changeStatus(item, action)} />)}</div>
            )}

            {schedulesQuery.hasMore && !schedulesQuery.error && <div className="flex justify-center"><Button outline disabled={schedulesQuery.isValidating} onClick={() => void schedulesQuery.setSize(schedulesQuery.size + 1)}>Cargar más recurrencias</Button></div>}
            {!schedulesQuery.hasMore && schedulesQuery.schedules.length > 0 && <p className="pb-4 text-center text-xs text-ink-muted">Todas las recurrencias disponibles para este proyecto están cargadas.</p>}
          </>
        )}
      </main>
    </PageTransition>
  )
}
