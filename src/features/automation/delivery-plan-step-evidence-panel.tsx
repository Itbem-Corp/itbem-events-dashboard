'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { useId, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import {
  abbreviatedEvidenceDigest,
  DELIVERY_PLAN_STEP_EVIDENCE_PAGE_SIZE,
  deliveryPlanStepEvidenceContentPath,
  deliveryPlanStepEvidencePath,
  formatEvidenceSize,
  parseDeliveryPlanStepEvidence,
  type DeliveryPlanStepEvidenceItem,
  type DeliveryPlanStepEvidencePage,
} from './delivery-plan-step-evidence'
import type { DeliveryPlanStepEvidenceRequirement } from './delivery-plan-steps'

export const DELIVERY_PLAN_STEP_EVIDENCE_REFRESH_INTERVAL_MS = 30_000

type DeliveryPlanStepEvidencePanelProps = {
  planId: string
  planVersion: number
  stepId: string
  stepTitle: string
  requirements: DeliveryPlanStepEvidenceRequirement[]
}

function uniqueItems(items: DeliveryPlanStepEvidenceItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function dateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin fecha disponible'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function sourceLabel(source: string) {
  if (source === 'agent' || source === 'worker') return 'Agente'
  return source.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('es-MX'))
}

function RequirementEvidence({
  requirement,
  items,
  isResolved,
  isChecking,
  stepId,
  planId,
  downloadingId,
  downloadError,
  onDownload,
}: {
  requirement: DeliveryPlanStepEvidenceRequirement
  items: DeliveryPlanStepEvidenceItem[]
  isResolved: boolean
  isChecking: boolean
  stepId: string
  planId: string
  downloadingId: string | null
  downloadError: { id: string; message: string } | null
  onDownload: (item: DeliveryPlanStepEvidenceItem) => void
}) {
  const itemHeadingId = useId()
  const isMissing = isResolved && requirement.required && items.length === 0
  const badgeColor = items.length > 0 ? 'emerald' : isMissing ? 'amber' : 'zinc'
  const statusLabel =
    items.length > 0
      ? `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`
      : isChecking
        ? 'Consultando'
        : isMissing
          ? 'Falta evidencia'
          : requirement.required
            ? 'Sin evidencia visible'
            : 'Opcional'

  return (
    <li className="min-w-0 rounded-xl border border-border-subtle bg-surface-raised p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-xs font-semibold text-ink">{requirement.title}</h5>
          {requirement.description ? (
            <p className="mt-1 text-xs leading-5 text-ink-secondary">{requirement.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge color={requirement.required ? 'indigo' : 'zinc'}>
            {requirement.required ? 'Requerida' : 'Opcional'}
          </Badge>
          <Badge color={badgeColor}>{statusLabel}</Badge>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-ink-muted">
        Formatos: {requirement.content_types.join(', ')} · Máximo {formatEvidenceSize(requirement.max_bytes)}
      </p>
      {items.length > 0 ? (
        <div className="mt-3">
          <h6 id={itemHeadingId} className="sr-only">
            Archivos recibidos para {requirement.title}
          </h6>
          <ul aria-labelledby={itemHeadingId} className="grid gap-2">
            {items.map((item) => (
              <li key={item.id} className="min-w-0 rounded-lg border border-border-subtle/70 bg-surface-soft p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium break-words text-ink">{item.file_name}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {item.content_type} · {formatEvidenceSize(item.size_bytes)} · {sourceLabel(item.source)} ·{' '}
                      <time dateTime={item.created_at}>{dateTime(item.created_at)}</time>
                    </p>
                  </div>
                  <Button
                    outline
                    type="button"
                    disabled={downloadingId === item.id}
                    onClick={() => onDownload(item)}
                    aria-label={`Descargar evidencia ${item.file_name}`}
                  >
                    {downloadingId === item.id ? 'Descargando…' : 'Descargar'}
                  </Button>
                </div>
                {downloadError?.id === item.id ? (
                  <p role="alert" className="mt-2 text-xs text-rose-800 dark:text-rose-200">
                    {downloadError.message}
                  </p>
                ) : null}
                <details className="mt-2 rounded-md border border-border-subtle/70 px-2 py-1.5">
                  <summary className="cursor-pointer text-[11px] font-medium text-ink-secondary focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                    Contexto seguro de ejecución
                  </summary>
                  <dl className="mt-2 grid min-w-0 gap-x-3 gap-y-1 text-[11px] break-all text-ink-muted sm:grid-cols-2">
                    <div>
                      <dt className="inline">Tarea: </dt>
                      <dd className="inline">{item.automation_task_id}</dd>
                    </div>
                    <div>
                      <dt className="inline">Ejecución: </dt>
                      <dd className="inline">{item.run_id}</dd>
                    </div>
                    <div>
                      <dt className="inline">Agente: </dt>
                      <dd className="inline">{item.agent_key}</dd>
                    </div>
                    <div>
                      <dt className="inline">Instancia: </dt>
                      <dd className="inline">{item.agent_instance_id}</dd>
                    </div>
                    <div>
                      <dt className="inline">Fencing: </dt>
                      <dd className="inline">{item.fencing_token}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="inline">SHA-256: </dt>
                      <dd className="inline">
                        <code>{abbreviatedEvidenceDigest(item.sha256)}</code>
                      </dd>
                    </div>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : isMissing ? (
        <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
          No hay un registro de esta evidencia en el historial consultado del paso.
        </p>
      ) : !isResolved ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          {isChecking ? 'Verificando el historial del paso…' : 'No se pudo confirmar si existe evidencia.'}
        </p>
      ) : requirement.required ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Todavía no se encuentra en los registros cargados. Consulta el historial anterior para confirmar si falta.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          No se ha registrado un archivo para este requisito opcional.
        </p>
      )}
    </li>
  )
}

export function DeliveryPlanStepEvidencePanel({
  planId,
  planVersion,
  stepId,
  stepTitle,
  requirements,
}: DeliveryPlanStepEvidencePanelProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null)
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<DeliveryPlanStepEvidencePage>(
    (pageIndex, previousPage) => {
      if (pageIndex === 0) return [deliveryPlanStepEvidencePath(planId, stepId), planVersion] as const
      if (!previousPage?.next_cursor) return null
      return [deliveryPlanStepEvidencePath(planId, stepId, { cursor: previousPage.next_cursor }), planVersion] as const
    },
    async ([path, requestedPlanVersion]: readonly [string, number]) =>
      parseDeliveryPlanStepEvidence(await fetcher<unknown>(path), {
        planId,
        planVersion: requestedPlanVersion,
        stepId,
      }),
    {
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
      refreshInterval: DELIVERY_PLAN_STEP_EVIDENCE_REFRESH_INTERVAL_MS,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  )

  if (requirements.length === 0) return null

  const evidence = uniqueItems((data ?? []).flatMap((page) => page.items))
  const hasMore = Boolean(data?.length && data[data.length - 1]?.next_cursor)
  const isResolved = Boolean(data?.length && !hasMore)
  const isChecking = isLoading || !data || Boolean(isValidating && data.length === 0)

  async function download(item: DeliveryPlanStepEvidenceItem) {
    if (downloadingId) return
    setDownloadingId(item.id)
    setDownloadError(null)
    try {
      const response = await api.get(deliveryPlanStepEvidenceContentPath(planId, stepId, item.id), {
        responseType: 'blob',
      })
      const objectURL = URL.createObjectURL(response.data as Blob)
      const anchor = document.createElement('a')
      anchor.href = objectURL
      anchor.download = item.file_name
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectURL), 1_000)
    } catch (requestError) {
      setDownloadError({
        id: item.id,
        message: getApiErrorMessage(requestError, 'No se pudo descargar la evidencia autorizada.'),
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section
      aria-label={`Evidencia de ${stepTitle}`}
      className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-ink">Evidencia del paso · {requirements.length}</h4>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-ink-muted">
            Registros verificados por el servidor. Su existencia no reemplaza la validación del agente para completar el
            paso; los archivos se adjuntan durante la ejecución y aquí se consultan de forma segura.
          </p>
        </div>
        {evidence.length > 0 ? <Badge color="zinc">{evidence.length} cargados</Badge> : null}
      </div>

      {isLoading && !data ? (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-ink-muted">
          Consultando evidencia registrada…
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[.045] p-3"
        >
          <p className="text-xs leading-5 text-rose-800 dark:text-rose-200">
            {getApiErrorMessage(error, 'No se pudo consultar la evidencia de este paso.')}
          </p>
          <Button outline type="button" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      ) : null}

      <ul className="mt-3 grid gap-2">
        {requirements.map((requirement) => (
          <RequirementEvidence
            key={requirement.key}
            requirement={requirement}
            items={evidence.filter((item) => item.requirement_key === requirement.key)}
            isResolved={isResolved}
            isChecking={isChecking}
            planId={planId}
            stepId={stepId}
            downloadingId={downloadingId}
            downloadError={downloadError}
            onDownload={(item) => void download(item)}
          />
        ))}
      </ul>

      {data && hasMore ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <p className="text-center text-[11px] text-ink-muted">
            Hay registros anteriores sin consultar; los requisitos requeridos aún no encontrados no se marcan como
            faltantes.
          </p>
          <Button
            outline
            type="button"
            aria-label="Cargar evidencia anterior"
            onClick={() => void setSize(size + 1)}
            disabled={isValidating}
          >
            {isValidating ? 'Cargando…' : 'Cargar evidencia anterior'}
          </Button>
        </div>
      ) : null}
      {data?.length ? (
        <p className="mt-2 text-center text-[10px] text-ink-muted">
          Página de hasta {DELIVERY_PLAN_STEP_EVIDENCE_PAGE_SIZE} registros · cursor estable
        </p>
      ) : null}
    </section>
  )
}
