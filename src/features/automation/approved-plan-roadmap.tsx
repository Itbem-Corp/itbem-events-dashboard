import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { DeliveryPlanAssignmentEventTimeline } from './delivery-plan-assignment-event-timeline'
import { DeliveryPlanStepActivityFeed } from './delivery-plan-step-activity-feed'
import {
  deliveryPlanStepEventsPath,
  parseDeliveryPlanStepEvents,
  type DeliveryPlanStepEventsPage,
} from './delivery-plan-step-events'
import { DeliveryPlanStepEvidencePanel } from './delivery-plan-step-evidence-panel'
import {
  deliveryPlanStepsPath,
  parseDeliveryPlanSteps,
  type DeliveryPlanStep,
  type DeliveryPlanStepsSnapshot,
} from './delivery-plan-steps'
import { resolveDeliveryStepFocus, type DeliveryStepFocusResolution } from './delivery-step-focus'
import type { DeliveryAutomationTask } from './delivery-types'

type ApprovedPlanRoadmapProps = {
  planId: string
  version: number
  steps: string[]
  qa: string[]
  evidence: string[]
  implementationTask?: DeliveryAutomationTask
  focusStepKey?: string
  focusRunId?: string
  onFocusResolution?: (result: DeliveryStepFocusResolution | { status: 'unavailable'; stepKey: string }) => void
}

const progressLabels: Record<string, string> = {
  thinking: 'Preparando el cambio',
  reading: 'Leyendo el código',
  validating: 'Aplicando y validando',
  repairing: 'Corrigiendo el resultado',
  acceptance: 'Comprobando aceptación',
}

const stepStatusLabels: Record<string, string> = {
  planned: 'Planeado',
  ready: 'Listo',
  running: 'En curso',
  blocked: 'Bloqueado',
  completed: 'Completado',
  failed: 'Fallido',
  skipped: 'Omitido',
}

function stepStatusColor(status: string): 'amber' | 'indigo' | 'rose' | 'emerald' | 'zinc' {
  if (status === 'ready') return 'amber'
  if (status === 'running') return 'indigo'
  if (status === 'blocked' || status === 'failed') return 'rose'
  if (status === 'completed') return 'emerald'
  return 'zinc'
}

function executionStatus(task?: DeliveryAutomationTask) {
  if (!task)
    return {
      label: 'Sin ejecución',
      detail: 'El plan fue aprobado, pero la implementación aún no tiene un intento registrado.',
    }
  if (task.status === 'queued')
    return { label: 'En cola', detail: 'La implementación espera capacidad del agente local.' }
  if (task.status === 'running')
    return {
      label: 'En curso',
      detail: `${progressLabels[task.progress_step ?? ''] ?? 'El agente está trabajando'}${task.progress_call ? ` · ${task.progress_call} llamada${task.progress_call === 1 ? '' : 's'}` : ''}.`,
    }
  if (task.status === 'completed')
    return {
      label: 'Intento terminado',
      detail: 'El intento produjo un resultado. Revisa el cambio y sus pruebas antes de dar por cumplidos los pasos.',
    }
  if (task.status === 'cancel_requested')
    return { label: 'Deteniéndose', detail: 'Se solicitó detener el intento; su resultado todavía no es definitivo.' }
  if (task.status === 'cancelled')
    return { label: 'Detenido', detail: 'Este intento se detuvo sin verificar los pasos del plan.' }
  return {
    label: 'Requiere atención',
    detail: 'El intento no terminó correctamente. Consulta la actividad para conocer la causa.',
  }
}

function planMaterializationErrorMessage(error: unknown) {
  const status =
    (error as { response?: { status?: unknown }; status?: unknown } | null)?.response?.status ??
    (error as { status?: unknown } | null)?.status
  if (status === 403)
    return 'Tu cuenta no tiene permiso para gestionar este proyecto. Pide a un project manager que normalice este plan.'
  if (status === 401) return 'Tu sesión ya no está autorizada. Inicia sesión nuevamente e inténtalo otra vez.'
  return getApiErrorMessage(
    error,
    'No se confirmó la normalización de los pasos. Revisa la conexión y vuelve a consultar el panel antes de reintentar.'
  )
}

function dateTime(value?: string) {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin dato'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function StepTimestamps({ step }: { step: DeliveryPlanStep }) {
  const values = [
    ...(step.started_at ? [{ label: 'Inició', value: step.started_at }] : []),
    ...(step.completed_at ? [{ label: 'Terminó', value: step.completed_at }] : []),
    ...(!step.completed_at
      ? [
          {
            label: step.started_at ? 'Actualizado' : 'Creado',
            value: step.started_at ? step.updated_at : step.created_at,
          },
        ]
      : []),
  ]

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
      {values.map(({ label, value }) => (
        <div key={label} className="flex gap-1">
          <dt>{label}:</dt>
          <dd>
            <time dateTime={value}>{dateTime(value)}</time>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function eventTypeLabel(eventType: string) {
  return eventType.replaceAll('_', ' ')
}

function StepEventHistory({
  planId,
  planVersion,
  step,
}: {
  planId: string
  planVersion: number
  step: DeliveryPlanStep
}) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<DeliveryPlanStepEventsPage>(
    (pageIndex, previousPage) => {
      if (!isOpen) return null
      if (pageIndex === 0) return deliveryPlanStepEventsPath(planId, step.id)
      if (!previousPage?.next_cursor) return null
      return deliveryPlanStepEventsPath(planId, step.id, previousPage.next_cursor)
    },
    async (key) => parseDeliveryPlanStepEvents(await fetcher<unknown>(key), { planId, planVersion, stepId: step.id }),
    { dedupingInterval: 5_000, revalidateOnFocus: true, revalidateFirstPage: false }
  )

  const seenEventIds = new Set<string>()
  const events = (data ?? [])
    .flatMap((page) => page.items)
    .filter((event) => {
      if (seenEventIds.has(event.id)) return false
      seenEventIds.add(event.id)
      return true
    })
  const hasMore = Boolean(data?.length && data[data.length - 1]?.next_cursor)

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <Button
        outline
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? 'Ocultar historial' : 'Ver historial del paso'}
      </Button>
      {isOpen ? (
        <div
          id={panelId}
          className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3"
          aria-label={`Historial de ${step.title}`}
        >
          {isLoading && !data ? (
            <p role="status" aria-live="polite" className="text-xs text-ink-muted">
              Cargando historial del paso…
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs leading-5 text-rose-800 dark:text-rose-200">
                {getApiErrorMessage(error, 'No se pudo cargar la actividad de este paso.')}
              </p>
              <Button outline type="button" onClick={() => void mutate()} disabled={isValidating}>
                {isValidating ? 'Reintentando…' : 'Reintentar'}
              </Button>
            </div>
          ) : null}
          {data && events.length === 0 && !error ? (
            <p role="status" aria-label="Historial vacío" className="text-xs leading-5 text-ink-muted">
              Aún no hay eventos para este paso.
            </p>
          ) : null}
          {events.length > 0 ? (
            <ol aria-label="Eventos del paso" className="grid gap-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border border-border-subtle/70 bg-surface-soft p-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="text-xs font-semibold text-ink capitalize">{eventTypeLabel(event.event_type)}</p>
                    <time className="text-[11px] text-ink-muted" dateTime={event.occurred_at}>
                      {dateTime(event.occurred_at)}
                    </time>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">{event.summary}</p>
                  <dl
                    aria-label="Identificadores de ejecución"
                    className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted"
                  >
                    {[
                      { label: 'Agente', value: event.agent_key },
                      { label: 'Equipo', value: event.machine_id },
                      { label: 'Instancia', value: event.worker_id },
                      { label: 'Ejecución', value: event.run_id },
                      { label: 'Tarea', value: event.automation_task_id },
                    ]
                      .filter(({ value }) => Boolean(value))
                      .map(({ label, value }) => (
                        <div key={label} className="flex gap-1">
                          <dt>{label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                  {event.from_status || event.to_status ? (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Estado: {event.from_status || '—'} → {event.to_status || '—'}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {hasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                outline
                type="button"
                aria-label="Cargar anteriores"
                onClick={() => void setSize(size + 1)}
                disabled={isValidating}
              >
                {isValidating ? 'Cargando…' : 'Cargar anteriores'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function NormalizedStepList({
  snapshot,
  focusStepKey,
  focusRunId,
}: {
  snapshot: DeliveryPlanStepsSnapshot
  focusStepKey?: string
  focusRunId?: string
}) {
  const titleByKey = new Map(snapshot.items.map((step) => [step.step_key, step.title]))

  return (
    <ol
      aria-label={`Pasos estructurados del plan v${snapshot.plan_version}`}
      className="mt-5 grid gap-3 md:grid-cols-2"
    >
      {snapshot.items.map((step, index) => {
        const dependencies = step.depends_on.map((key) => titleByKey.get(key) ?? key)
        const isFocused = Boolean(focusStepKey && step.step_key === focusStepKey)
        return (
          <li
            key={step.id}
            id={`delivery-plan-step-${encodeURIComponent(step.id)}`}
            data-agent-focused-step={isFocused ? 'true' : undefined}
            aria-current={isFocused ? 'step' : undefined}
            className={`rounded-2xl border p-4 ${isFocused ? 'border-(--tenant-accent)/50 bg-(--tenant-accent)/[.04] ring-2 ring-(--tenant-accent)/20' : 'border-border-subtle bg-surface-soft'}`}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--tenant-accent)/10 text-xs font-bold text-(--tenant-accent)"
                aria-label={`Paso ${index + 1}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-sm leading-5 font-semibold text-ink">{step.title}</h3>
                  <Badge color={stepStatusColor(step.status)}>{stepStatusLabels[step.status] ?? step.status}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">Clave · {step.step_key}</p>
                {step.objective ? <p className="mt-2 text-xs leading-5 text-ink-secondary">{step.objective}</p> : null}
                <p className="mt-2 text-xs leading-5 text-ink-secondary">
                  <span className="font-semibold text-ink">Dependencias: </span>
                  {dependencies.length > 0 ? dependencies.join(' · ') : 'Ninguna declarada'}
                </p>
                {step.acceptance_criteria.length > 0 ? (
                  <details className="mt-2 rounded-xl border border-border-subtle/70 bg-surface-raised px-3">
                    <summary className="flex min-h-9 cursor-pointer items-center text-xs font-semibold text-ink-secondary focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                      Criterios de aceptación · {step.acceptance_criteria.length}
                    </summary>
                    <ul className="space-y-1 pb-3 text-xs leading-5 text-ink-secondary">
                      {step.acceptance_criteria.map((criterion, index) => (
                        <li key={`${step.step_key}-criterion-${index}`}>{criterion}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className="mt-3 border-t border-border-subtle pt-2">
                  <StepTimestamps step={step} />
                </div>
                <StepEventHistory planId={snapshot.plan_id} planVersion={snapshot.plan_version} step={step} />
                {step.evidence_requirements?.length ? (
                  <DeliveryPlanStepEvidencePanel
                    planId={snapshot.plan_id}
                    planVersion={snapshot.plan_version}
                    stepId={step.id}
                    stepTitle={step.title}
                    requirements={step.evidence_requirements}
                  />
                ) : null}
                <DeliveryPlanStepActivityFeed
                  planId={snapshot.plan_id}
                  planVersion={snapshot.plan_version}
                  stepId={step.id}
                  stepTitle={step.title}
                  openWhenFocused={isFocused}
                  originRunId={isFocused ? focusRunId : undefined}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function LegacyPlanSteps({ steps }: { steps: string[] }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Pasos sin estado estructurado"
      className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/[.045] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="amber">Sin pasos normalizados</Badge>
        <p className="text-xs leading-5 text-ink-secondary">
          Esta versión no tiene un estado estructurado por paso. Los datos textuales heredados se conservan abajo; no se
          infiere avance individual.
        </p>
      </div>
      {steps.length > 0 ? (
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {steps.map((step, index) => (
            <li
              key={`legacy-step-${index}`}
              className="flex gap-2 rounded-xl border border-border-subtle bg-surface-raised p-3 text-xs leading-5 text-ink-secondary"
            >
              <span className="font-bold text-ink-muted">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          La respuesta de la API trae cero pasos para esta versión (comportamiento esperado en planes anteriores a la
          materialización). No hay dependencias ni marcas de tiempo por paso disponibles.
        </p>
      )}
    </section>
  )
}

export function ApprovedPlanRoadmap({
  planId,
  version,
  steps,
  qa,
  evidence,
  implementationTask,
  focusStepKey,
  focusRunId,
  onFocusResolution,
}: ApprovedPlanRoadmapProps) {
  const execution = executionStatus(implementationTask)
  const path = deliveryPlanStepsPath(planId)
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    path,
    async (key) => parseDeliveryPlanSteps(await fetcher<unknown>(key), { planId, planVersion: version }),
    { dedupingInterval: 5_000, revalidateOnFocus: true }
  )
  const focusResolution = useMemo(
    () => (focusStepKey && data ? resolveDeliveryStepFocus(focusStepKey, data.items) : null),
    [data, focusStepKey]
  )
  const reportedFocusResults = useRef(new Set<string>())
  useEffect(() => {
    if (!focusStepKey || !onFocusResolution) return
    const result =
      focusResolution ?? (error && !data ? { status: 'unavailable' as const, stepKey: focusStepKey } : null)
    if (!result) return
    const resultKey = `${planId}:${version}:${focusStepKey}:${result.status}`
    if (reportedFocusResults.current.has(resultKey)) return
    reportedFocusResults.current.add(resultKey)
    onFocusResolution(result)
  }, [data, error, focusResolution, focusStepKey, onFocusResolution, planId, version])
  const [isMaterializing, setIsMaterializing] = useState(false)
  const [materializationError, setMaterializationError] = useState('')
  const [materializationNotice, setMaterializationNotice] = useState('')
  const canMaterializeLegacySteps = Boolean(
    data &&
      data.plan_id === planId &&
      data.plan_version === version &&
      data.items.length === 0 &&
      steps.length > 0 &&
      !error
  )

  async function materializeLegacySteps() {
    if (!canMaterializeLegacySteps || isMaterializing) return
    setIsMaterializing(true)
    setMaterializationError('')
    setMaterializationNotice('')
    try {
      await api.post(`${path}/materialize`)
    } catch (requestError) {
      setMaterializationError(planMaterializationErrorMessage(requestError))
      setIsMaterializing(false)
      return
    }

    setMaterializationNotice('La normalización se guardó. Actualizando los pasos del plan…')
    try {
      const refreshed = await mutate()
      if (refreshed && refreshed.items.length > 0) {
        setMaterializationNotice('Los pasos heredados ya están normalizados y su estado viene del registro del plan.')
      } else {
        setMaterializationNotice(
          'La operación se completó, pero esta lectura todavía no confirma los pasos. Reintenta la actualización del panel.'
        )
      }
    } catch {
      setMaterializationNotice(
        'La normalización se guardó, pero no se pudo actualizar el panel. Usa Reintentar para volver a consultar los pasos.'
      )
    } finally {
      setIsMaterializing(false)
    }
  }
  const countLabel = data?.items.length
    ? `${data.total} ${data.total === 1 ? 'paso estructurado' : 'pasos estructurados'}`
    : data
      ? `${steps.length} ${steps.length === 1 ? 'paso previsto · 0 normalizados' : 'pasos previstos · 0 normalizados'}`
      : `${steps.length} ${steps.length === 1 ? 'paso previsto' : 'pasos previstos'}`

  return (
    <section className="premium-surface rounded-3xl p-5 sm:p-6" aria-label="Pasos del plan aprobado">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
            Ruta aprobada · plan v{version}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Qué hará el agente, paso a paso</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
            El estado, las dependencias y los tiempos vienen del registro estructurado del plan. Abre el historial de
            cada paso para consultar su actividad registrada.
          </p>
        </div>
        <Badge color="indigo">{countLabel}</Badge>
      </div>
      <div
        className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface-soft p-4"
        role="status"
        aria-label="Estado de la implementación"
      >
        <Badge
          color={
            implementationTask?.status === 'running'
              ? 'indigo'
              : implementationTask?.status === 'completed'
                ? 'emerald'
                : implementationTask?.status === 'failed' || implementationTask?.status === 'dispatch_failed'
                  ? 'rose'
                  : 'zinc'
          }
        >
          {execution.label}
        </Badge>
        <p className="text-sm leading-6 text-ink-secondary">{execution.detail}</p>
      </div>

      {isLoading && !data ? (
        <p
          role="status"
          aria-live="polite"
          aria-label="Cargando pasos del plan"
          className="mt-5 rounded-2xl border border-border-subtle bg-surface-soft p-4 text-sm text-ink-muted"
        >
          Cargando estado de los pasos…
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[.045] p-4"
        >
          <p className="text-sm leading-5 text-rose-800 dark:text-rose-200">
            {getApiErrorMessage(error, 'No se pudieron cargar los pasos del plan.')}
          </p>
          <Button outline type="button" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      ) : null}
      {data && data.items.length > 0 ? (
        <>
          <NormalizedStepList
            snapshot={data}
            focusStepKey={focusResolution?.status === 'matched' ? focusStepKey : undefined}
            focusRunId={focusResolution?.status === 'matched' ? focusRunId : undefined}
          />
        </>
      ) : null}
      {data && data.items.length === 0 ? <LegacyPlanSteps steps={steps} /> : null}
      {canMaterializeLegacySteps ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs leading-5 text-ink-secondary">
              Convierte estos pasos heredados en registros estructurados para consultar dependencias, estado e historial
              individual. Esta acción no inicia ni ejecuta tareas.
            </p>
            <Button
              outline
              type="button"
              onClick={() => void materializeLegacySteps()}
              disabled={isMaterializing || isValidating}
            >
              {isMaterializing ? 'Normalizando…' : 'Normalizar pasos'}
            </Button>
          </div>
        </div>
      ) : null}
      {materializationError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/[.045] px-4 py-3 text-xs leading-5 text-rose-800 dark:text-rose-200"
        >
          {materializationError}
        </p>
      ) : null}
      {materializationNotice ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary"
        >
          {materializationNotice}
        </p>
      ) : null}

      <DeliveryPlanAssignmentEventTimeline planId={planId} planVersion={version} />

      {(qa.length > 0 || evidence.length > 0) && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {qa.length > 0 && (
            <div className="rounded-2xl border border-border-subtle p-4">
              <h3 className="text-sm font-semibold text-ink">Cómo se validará</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-secondary">
                {qa.map((check, index) => (
                  <li key={`qa-${index}`}>• {check}</li>
                ))}
              </ul>
            </div>
          )}
          {evidence.length > 0 && (
            <div className="rounded-2xl border border-border-subtle p-4">
              <h3 className="text-sm font-semibold text-ink">Evidencia esperada</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-secondary">
                {evidence.map((proof, index) => (
                  <li key={`evidence-${index}`}>• {proof}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
