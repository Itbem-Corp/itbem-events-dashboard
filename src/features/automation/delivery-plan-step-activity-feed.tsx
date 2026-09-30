'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { useEffect, useId, useRef, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import {
  DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE,
  deliveryPlanStepActivityActionLabel,
  deliveryPlanStepActivityPath,
  deliveryPlanStepActivityPhaseLabel,
  parseDeliveryPlanStepActivity,
  type DeliveryPlanStepInferenceAccounting,
  type DeliveryPlanStepActivityItem,
  type DeliveryPlanStepActivityPage,
} from './delivery-plan-step-activity'

export const DELIVERY_PLAN_STEP_ACTIVITY_REFRESH_INTERVAL_MS = 30_000

type DeliveryPlanStepActivityFeedProps = {
  planId: string
  planVersion: number
  stepId: string
  stepTitle: string
  openWhenFocused?: boolean
  originRunId?: string
}

type BadgeColor = 'amber' | 'indigo' | 'rose' | 'emerald' | 'violet' | 'sky' | 'zinc'

function actionColor(action: string): BadgeColor {
  if (action.includes('fail') || action.includes('error')) return 'rose'
  if (action.includes('file') || action.includes('evidence')) return 'sky'
  if (action.includes('tool') || action.includes('command')) return 'violet'
  if (action.includes('complete') || action.includes('finish') || action.includes('success')) return 'emerald'
  return 'indigo'
}

function phaseColor(phase: string): BadgeColor {
  if (phase.includes('fail') || phase.includes('error')) return 'rose'
  if (phase.includes('complete') || phase.includes('success')) return 'emerald'
  if (phase.includes('block')) return 'rose'
  if (phase.includes('queue') || phase.includes('pending')) return 'amber'
  if (phase.includes('run') || phase.includes('start') || phase.includes('request')) return 'indigo'
  return 'zinc'
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin dato'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function durationLabel(value: number | null) {
  if (value === null) return null
  if (value < 1_000) return `${value} ms`
  return `${(value / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s`
}

function abbreviatedSha256(value: string) {
  return `sha256:${value.slice(0, 12)}…`
}

function artifactSizeLabel(value: number) {
  if (value < 1_024) return `${value} bytes`
  const unit = value < 1_048_576 ? 'KiB' : 'MiB'
  const divisor = unit === 'KiB' ? 1_024 : 1_048_576
  return `${(value / divisor).toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${unit}`
}

function inferenceProviderLabel(value: string | null) {
  const labels: Record<string, string> = {
    deepseek: 'DeepSeek',
    minimax: 'MiniMax',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
  }
  return value ? labels[value] ?? 'No disponible' : 'No disponible'
}

function inferenceStatusLabel(value: DeliveryPlanStepInferenceAccounting['status']) {
  if (value === 'accepted') return 'Aceptada'
  if (value === 'rejected') return 'Rechazada'
  return 'No disponible'
}

function inferencePricingBasisLabel(value: DeliveryPlanStepInferenceAccounting['pricing_basis']) {
  if (value === 'official_api_price') return 'Precio oficial de API'
  if (value === 'unpriced') return 'Sin precio disponible'
  return 'No disponible'
}

function inferenceTokenLabel(value: number | null) {
  return value === null ? 'No disponible' : value.toLocaleString('es-MX')
}

function inferenceCostLabel(value: DeliveryPlanStepInferenceAccounting | null) {
  if (
    !value ||
    value.pricing_basis !== 'official_api_price' ||
    value.currency !== 'USD' ||
    value.total_cost_microusd === null
  )
    return 'No disponible'

  const dollars = value.total_cost_microusd / 1_000_000
  return `$${dollars.toLocaleString('es-MX', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USD`
}

function uniqueActivity(items: DeliveryPlanStepActivityItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function DeliveryPlanStepActivityFeed({
  planId,
  planVersion,
  stepId,
  stepTitle,
  openWhenFocused = false,
  originRunId,
}: DeliveryPlanStepActivityFeedProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<DeliveryPlanStepActivityPage>(
    (pageIndex, previousPage) => {
      if (!isOpen) return null
      if (pageIndex === 0) return [deliveryPlanStepActivityPath(planId, stepId), planVersion] as const
      if (!previousPage?.next_cursor) return null
      return [deliveryPlanStepActivityPath(planId, stepId, previousPage.next_cursor), planVersion] as const
    },
    async ([path, requestedPlanVersion]: readonly [string, number]) =>
      parseDeliveryPlanStepActivity(await fetcher<unknown>(path), {
        planId,
        planVersion: requestedPlanVersion,
        stepId,
      }),
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
      refreshInterval: DELIVERY_PLAN_STEP_ACTIVITY_REFRESH_INTERVAL_MS,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  )

  useEffect(() => {
    if (openWhenFocused) setIsOpen(true)
  }, [openWhenFocused])

  useEffect(() => {
    if (!isOpen || !openWhenFocused) return
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      panel.focus({ preventScroll: true })
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (typeof panel.scrollIntoView === 'function')
        panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, openWhenFocused])

  const activity = uniqueActivity((data ?? []).flatMap((page) => page.items))
  const hasMore = Boolean(data?.length && data[data.length - 1]?.next_cursor)

  return (
    <div className="mt-2">
      <Button
        outline
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? 'Ocultar actividad' : 'Ver diario de actividad'}
      </Button>
      {isOpen ? (
        <section
          id={panelId}
          ref={panelRef}
          tabIndex={-1}
          aria-label={`Actividad de ${stepTitle}`}
          className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-ink">Diario de actividad</h4>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                Eventos seguros del agente, sin prompts ni contenido privado. Se actualiza al volver a esta pestaña y
                cada 30 segundos.
              </p>
              {originRunId ? (
                <p className="mt-1 text-[11px] leading-4 text-ink-muted">
                  Ejecución de origen: <span className="font-medium text-ink-secondary">{originRunId}</span>. Se muestra
                  el historial paginado de este paso; el servicio no filtra por ejecución y, si el evento está cargado,
                  queda marcado.
                </p>
              ) : null}
            </div>
            {activity.length > 0 ? (
              <Badge color="zinc">
                {activity.length} {activity.length === 1 ? 'registro' : 'registros'}
              </Badge>
            ) : null}
          </div>

          {isLoading && !data ? (
            <p role="status" aria-live="polite" className="text-xs text-ink-muted">
              Cargando actividad del paso…
            </p>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[.045] p-3"
            >
              <p className="text-xs leading-5 text-rose-800 dark:text-rose-200">
                {getApiErrorMessage(error, 'No se pudo cargar la actividad de este paso.')}
              </p>
              <Button outline type="button" onClick={() => void mutate()} disabled={isValidating}>
                {isValidating ? 'Reintentando…' : 'Reintentar'}
              </Button>
            </div>
          ) : null}
          {data && activity.length === 0 && !error ? (
            <p role="status" aria-label="Diario de actividad vacío" className="text-xs leading-5 text-ink-muted">
              Aún no hay actividad registrada para este paso.
            </p>
          ) : null}

          {activity.length > 0 ? (
            <ol aria-label="Registros de actividad del paso" className="grid gap-2">
              {activity.map((item) => {
                const duration = durationLabel(item.duration_ms)
                const identifiers = [
                  { label: 'Herramienta', value: item.tool_name },
                  { label: 'Agente', value: item.agent_key },
                  { label: 'Equipo', value: item.machine_id },
                  { label: 'Identidad de instancia', value: item.agent_instance_id },
                  { label: 'Worker', value: item.worker_id },
                  { label: 'Ejecución', value: item.run_id },
                  { label: 'Tarea', value: item.automation_task_id },
                  ...(duration ? [{ label: 'Duración', value: duration }] : []),
                ].filter(({ value }) => Boolean(value))

                const hasExecutionMetadata = item.details?.executable_name !== undefined
                const hasFileOrReferenceMetadata = Boolean(
                  item.details?.changed_files?.length || item.details?.resource_references?.length
                )
                const hasDependencyMetadata = item.details?.applied_dependency_manifest_sha256 !== undefined
                const belongsToOriginRun = Boolean(originRunId && item.run_id === originRunId)
                return (
                  <li
                    key={item.id}
                    className={`min-w-0 rounded-lg border p-3 ${belongsToOriginRun ? 'border-(--tenant-accent)/45 bg-(--tenant-accent)/[.04] ring-1 ring-(--tenant-accent)/15' : 'border-border-subtle/70 bg-surface-soft'}`}
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge color="zinc">#{item.sequence}</Badge>
                        {belongsToOriginRun ? <Badge color="indigo">Ejecución enlazada</Badge> : null}
                        <Badge color={actionColor(item.action)}>
                          {deliveryPlanStepActivityActionLabel(item.action)}
                        </Badge>
                        <Badge color={phaseColor(item.phase)}>{deliveryPlanStepActivityPhaseLabel(item.phase)}</Badge>
                      </div>
                      <time className="shrink-0 text-[11px] text-ink-muted" dateTime={item.occurred_at}>
                        {dateTime(item.occurred_at)}
                      </time>
                    </div>
                    <p className="mt-2 text-xs leading-5 break-words text-ink-secondary">{item.summary}</p>
                    {item.action === 'inference' && (item.phase === 'completed' || item.phase === 'failed') ? (
                      <section
                        aria-label="Contabilidad de inferencia"
                        className="mt-2 rounded-md border border-border-subtle/70 bg-surface-soft p-2"
                      >
                        {item.inference ? (
                          <dl className="grid min-w-0 gap-1 text-[11px] text-ink-muted sm:grid-cols-2">
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Proveedor:</dt>
                              <dd>{inferenceProviderLabel(item.inference.provider)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Modelo:</dt>
                              <dd className="break-all">{item.inference.model ?? 'No disponible'}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Estado:</dt>
                              <dd>{inferenceStatusLabel(item.inference.status)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens de entrada:</dt>
                              <dd>{inferenceTokenLabel(item.inference.input_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens de salida:</dt>
                              <dd>{inferenceTokenLabel(item.inference.output_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens de entrada en caché:</dt>
                              <dd>{inferenceTokenLabel(item.inference.cached_input_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens de escritura en caché:</dt>
                              <dd>{inferenceTokenLabel(item.inference.cache_write_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens de razonamiento:</dt>
                              <dd>{inferenceTokenLabel(item.inference.reasoning_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Tokens totales:</dt>
                              <dd>{inferenceTokenLabel(item.inference.total_tokens)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Costo registrado:</dt>
                              <dd>{inferenceCostLabel(item.inference)}</dd>
                            </div>
                            <div className="flex min-w-0 gap-1 sm:col-span-2">
                              <dt className="shrink-0">Base de precio:</dt>
                              <dd>{inferencePricingBasisLabel(item.inference.pricing_basis)}</dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="text-[11px] text-ink-muted">
                            Contabilidad canónica de inferencia: <span className="font-medium">No disponible</span>
                          </p>
                        )}
                      </section>
                    ) : null}
                    {item.action === 'evidence' && item.phase === 'completed' && item.details ? (
                      <dl aria-label="Metadatos de evidencia" className="mt-2 grid gap-1 text-[11px] text-ink-muted">
                        {item.details.acceptance_checks?.map((check, index) => (
                          <div key={`${check.criterion_sha256}-${index}`} className="flex flex-wrap items-center gap-2">
                            <dt>Check de aceptación {index + 1}:</dt>
                            <dd>
                              <code>{abbreviatedSha256(check.criterion_sha256)}</code>
                            </dd>
                            <Badge color={check.passed ? 'emerald' : 'rose'}>
                              {check.passed ? 'Aprobado' : 'Fallido'}
                            </Badge>
                          </div>
                        ))}
                        {item.details.review_diff_sha256 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <dt>Diff revisado:</dt>
                            <dd>
                              <code>{abbreviatedSha256(item.details.review_diff_sha256)}</code>
                            </dd>
                          </div>
                        ) : null}
                        {item.details.patch_artifacts?.map((artifact, index) => (
                          <div
                            key={`${artifact.repository_ref}-${artifact.sha256}`}
                            className="grid min-w-0 gap-1 rounded-md border border-border-subtle/70 bg-surface-soft p-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3"
                          >
                            <dt className="font-medium text-ink-secondary">Parche verificado {index + 1}</dt>
                            <dd className="grid min-w-0 gap-1">
                              <span className="flex min-w-0 flex-wrap gap-x-1">
                                <span>Repositorio:</span>
                                <code className="break-all">{artifact.repository_ref}</code>
                              </span>
                              <span className="flex min-w-0 flex-wrap gap-x-1">
                                <span>Base:</span>
                                <code className="break-all">{artifact.base_sha}</code>
                              </span>
                              <span className="flex min-w-0 flex-wrap gap-x-1">
                                <span>SHA:</span>
                                <code>{abbreviatedSha256(artifact.sha256)}</code>
                              </span>
                              <span className="flex min-w-0 flex-wrap gap-x-1">
                                <span>Tamaño:</span>
                                <span>{artifactSizeLabel(artifact.size_bytes)}</span>
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {hasExecutionMetadata || hasFileOrReferenceMetadata || hasDependencyMetadata ? (
                      <details className="mt-2 rounded-md border border-border-subtle/70 bg-surface-soft p-2">
                        <summary className="cursor-pointer text-[11px] font-medium text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
                          Ver metadatos seguros
                        </summary>
                        <dl
                          aria-label="Metadatos seguros del resultado"
                          className="mt-2 grid min-w-0 gap-1 text-[11px] text-ink-muted sm:grid-cols-2"
                        >
                          {item.details?.executable_name !== undefined ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Ejecutable:</dt>
                              <dd>
                                <code>{item.details.executable_name}</code>
                              </dd>
                            </div>
                          ) : null}
                          {item.details?.argument_count !== undefined ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Cantidad de argumentos:</dt>
                              <dd>{item.details.argument_count}</dd>
                            </div>
                          ) : null}
                          {item.details?.exit_code !== undefined ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Código de salida:</dt>
                              <dd>{item.details.exit_code}</dd>
                            </div>
                          ) : null}
                          {item.details?.captured_output_bytes !== undefined ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Bytes de salida capturados:</dt>
                              <dd>{item.details.captured_output_bytes}</dd>
                            </div>
                          ) : null}
                          {item.details?.applied_dependency_manifest_sha256 ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Manifiesto de dependencias aplicado:</dt>
                              <dd>
                                <code>{abbreviatedSha256(item.details.applied_dependency_manifest_sha256)}</code>
                              </dd>
                            </div>
                          ) : null}
                          {item.details?.applied_dependency_patch_count !== undefined ? (
                            <div className="flex min-w-0 gap-1">
                              <dt className="shrink-0">Parches de dependencias aplicados:</dt>
                              <dd>{item.details.applied_dependency_patch_count}</dd>
                            </div>
                          ) : null}
                          {item.details?.changed_files?.length ? (
                            <div className="grid min-w-0 gap-1 sm:col-span-2">
                              <dt>Archivos modificados:</dt>
                              <dd>
                                <ul className="grid gap-1">
                                  {item.details.changed_files.map((file) => (
                                    <li key={file}>
                                      <code className="break-all">{file}</code>
                                    </li>
                                  ))}
                                </ul>
                              </dd>
                            </div>
                          ) : null}
                          {item.details?.resource_references?.length ? (
                            <div className="grid min-w-0 gap-1 sm:col-span-2">
                              <dt>Referencias de recursos:</dt>
                              <dd>
                                <ul className="grid gap-1">
                                  {item.details.resource_references.map((reference) => (
                                    <li key={reference}>
                                      <code className="break-all">{reference}</code>
                                    </li>
                                  ))}
                                </ul>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </details>
                    ) : null}
                    {identifiers.length > 0 ? (
                      <dl
                        aria-label="Contexto seguro del registro"
                        className="mt-2 grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 text-[11px] text-ink-muted sm:grid-cols-2"
                      >
                        {identifiers.map(({ label, value }) => (
                          <div key={label} className="flex min-w-0 gap-1">
                            <dt className="shrink-0">{label}:</dt>
                            <dd className="min-w-0 break-all">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          ) : null}

          {hasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                outline
                type="button"
                aria-label="Cargar actividad anterior"
                onClick={() => void setSize(size + 1)}
                disabled={isValidating}
              >
                {isValidating ? 'Cargando…' : 'Cargar actividad anterior'}
              </Button>
            </div>
          ) : null}
          {data?.length ? (
            <p className="mt-2 text-center text-[10px] text-ink-muted">
              Página de hasta {DELIVERY_PLAN_STEP_ACTIVITY_PAGE_SIZE} registros · cursor estable
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
