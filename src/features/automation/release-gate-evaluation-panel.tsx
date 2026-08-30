'use client'

import { Badge } from '@/components/badge'
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'
import {
  latestReleaseGateEvaluation,
  releaseGateReasonLabel,
  type ReleaseGateEvaluationSnapshot,
} from '@/features/automation/release-gate-evaluations'

type ReleaseGateEvaluationPanelProps = {
  workItemId: string
  snapshot?: ReleaseGateEvaluationSnapshot
  loading?: boolean
  validating?: boolean
  unavailable?: boolean
  onRefresh: () => void
}

function evaluationDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no verificable'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function shortDigest(value?: string) {
  return value ? `${value.slice(0, 12)}…` : 'No disponible'
}

export function ReleaseGateEvaluationPanel({
  workItemId,
  snapshot,
  loading = false,
  validating = false,
  unavailable = false,
  onRefresh,
}: ReleaseGateEvaluationPanelProps) {
  const latest = latestReleaseGateEvaluation(snapshot, workItemId)
  const evaluationCount = snapshot?.work_item_id === workItemId && Array.isArray(snapshot.evaluations)
    ? snapshot.evaluations.length
    : 0

  return (
    <section aria-labelledby="release-gate-evaluation-title" className="premium-surface overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Gatekeeper determinista</p>
          <h2 id="release-gate-evaluation-title" className="mt-1 truncate text-sm font-semibold text-ink">Evidencia de merge y release</h2>
        </div>
        <button
          type="button"
          aria-label="Actualizar evaluaciones del Gatekeeper"
          onClick={onRefresh}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
        >
          <ArrowPathIcon className={`size-4 ${validating ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>
      </div>

      {unavailable ? (
        <div role="status" className="flex items-start gap-3 px-5 py-4">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-ink">No se pudo verificar el Gatekeeper</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">La autoridad de merge y release permanece bloqueada hasta recuperar evidencia íntegra.</p>
          </div>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Cargando evaluaciones del Gatekeeper" className="space-y-3 px-5 py-5">
          <div className="h-5 w-36 animate-pulse rounded-full bg-surface-soft motion-reduce:animate-none" />
          <div className="h-14 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
        </div>
      ) : !latest ? (
        <div className="flex items-start gap-3 px-5 py-4">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-ink">Sin evaluación registrada</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Todavía no existe evidencia determinista para autorizar merge o release.</p>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {latest.state === 'allowed' ? (
                <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              ) : (
                <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-rose-500" />
              )}
              <div>
                <p className="text-sm font-semibold text-ink">
                  {latest.action === 'merge' ? 'Merge' : 'Release'} · {latest.change_set_id}
                </p>
                <p className="mt-1 text-xs text-ink-muted">Secuencia {latest.sequence} · {evaluationDate(latest.occurred_at)}</p>
              </div>
            </div>
            <Badge color={latest.state === 'allowed' ? 'emerald' : 'rose'}>
              {latest.state === 'allowed' ? 'Evidencia completa' : 'Bloqueado'}
            </Badge>
          </div>

          {latest.state === 'blocked' ? (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">{latest.reasons.length} bloqueo{latest.reasons.length === 1 ? '' : 's'} vigente{latest.reasons.length === 1 ? '' : 's'}</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-secondary">
                {latest.reasons.slice(0, 4).map((reason, index) => (
                  <li key={`${reason.code}:${reason.repository ?? ''}:${reason.evidence ?? ''}:${index}`} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{releaseGateReasonLabel(reason)}</span>
                  </li>
                ))}
              </ul>
              {latest.reasons.length > 4 ? <p className="mt-2 text-xs text-ink-muted">+{latest.reasons.length - 4} bloqueos adicionales en esta evaluación.</p> : null}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs leading-5 text-ink-secondary">
              La evidencia coincidía con el commit, política y matriz exactos al evaluarse. Cualquier cambio exige una evaluación nueva.
            </p>
          )}

          <details className="mt-3 rounded-2xl border border-border-subtle bg-surface-soft px-3 py-2.5">
            <summary className="min-h-9 cursor-pointer py-1 text-xs font-semibold text-ink-secondary">Ver identidad verificable</summary>
            <dl className="grid gap-2 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2">
              <div><dt className="text-ink-muted">Matriz</dt><dd className="mt-0.5 font-mono text-ink-secondary">{shortDigest(latest.matrix_digest)}</dd></div>
              <div><dt className="text-ink-muted">Sujeto aprobado</dt><dd className="mt-0.5 font-mono text-ink-secondary">{shortDigest(latest.subject_digest)}</dd></div>
              <div><dt className="text-ink-muted">Evaluaciones visibles</dt><dd className="mt-0.5 text-ink-secondary">{evaluationCount}{snapshot?.truncated ? '+' : ''}</dd></div>
            </dl>
          </details>
        </div>
      )}

      <p className="border-t border-border-subtle px-5 py-3 text-[11px] leading-4 text-ink-muted">
        Esta evaluación es evidencia; nunca ejecuta ni sustituye la aprobación humana, el merge o el despliegue.
      </p>
    </section>
  )
}
