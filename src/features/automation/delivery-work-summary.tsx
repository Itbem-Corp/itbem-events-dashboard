'use client'

import type { AuthenticatedSSEStatus } from '@/hooks/useAuthenticatedSSE'
import { blockedReasonPresentation } from './delivery-task-status'
import { deliveryPresentation, type DeliveryDestination } from './delivery-presentation'
import type { DeliveryWorkItem } from './delivery-types'

export function deliverySignalLabel(lastActivityAt?: string, now = Date.now()) {
  if (!lastActivityAt) return 'Sin señal verificable'
  const timestamp = Date.parse(lastActivityAt)
  if (!Number.isFinite(timestamp)) return 'Señal no verificable'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return 'hace menos de 1 min'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

export function DeliveryWorkSummary({ item, connection, onOpen }: {
  item: DeliveryWorkItem
  connection: AuthenticatedSSEStatus
  onOpen: (view: DeliveryDestination) => void
}) {
  const state = deliveryPresentation(item)
  const blocked = item.agent_progress === 'blocked' || item.state === 'blocked'
    ? blockedReasonPresentation(item.blocked_reason)
    : undefined
  const projection = item.workflow_projection
  const recoveryDestination = projection?.recovery?.action_id === 'open_evidence' ? 'evidence'
    : projection?.recovery?.action_id === 'open_activity' ? 'activity'
      : projection?.recovery ? 'control' : undefined
  const recoveryActionLabel = projection?.recovery?.mode === 'reconcile' ? 'Revisar evidencia'
    : projection?.recovery?.mode === 'operator_input' ? 'Abrir conversación'
      : projection?.recovery?.mode === 'human_review' ? 'Revisar y decidir'
      : projection?.recovery?.mode === 'budget' ? 'Abrir controles'
        : projection?.recovery?.mode === 'credentials' ? 'Abrir controles'
          : projection?.recovery?.mode === 'repair' ? 'Ver actividad'
              : projection?.recovery?.mode === 'resume' ? (projection.recovery.action_id === 'open_control' ? 'Abrir controles' : 'Ver actividad')
                : 'Revisar intento'
  const assignedAgent = item.assigned_agent || projection?.actor?.model || (projection?.actor?.type === 'human' ? 'No aplica · decisión humana' : 'Pendiente de asignación')
  const waitingForHumanDecision = projection?.recovery?.mode === 'human_review'
  const signalTitle = waitingForHumanDecision
    ? 'El agente se detuvo de forma intencional en el gate humano. La antigüedad indica cuándo quedó lista la decisión, no la salud de un worker.'
    : projection?.stale
    ? `La última señal durable fue ${projection.last_activity_at ? deliverySignalLabel(projection.last_activity_at) : 'hace un tiempo'}; revisa actividad antes de continuar.`
    : connection === 'live' ? 'El canal está conectado; el estado durable sigue siendo la fuente de verdad.'
      : 'No hay un canal en vivo; esta vista refleja el último estado durable confirmado.'
  return <section aria-label="Resumen del trabajo" className="mt-5 rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-7">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
      <div className="min-w-0 max-w-3xl">
        <p className="text-xs font-semibold tracking-wide text-ink-secondary">{state.title}</p>
        <p className="mt-3 text-xs text-ink-secondary">Resultado esperado</p>
        <p className="mt-1 text-lg font-medium leading-7 text-ink">{item.expected_outcome || item.title}</p>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">{state.detail}</p>
      </div>
      <button type="button" onClick={() => onOpen(state.destination)} className="min-h-11 shrink-0 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2">
        {state.action}
      </button>
    </div>
    {projection?.recovery && <div className={`mt-5 rounded-2xl border px-4 py-3 ${projection.recovery.requires_human_review ? 'border-amber-500/25 bg-amber-500/[0.06]' : 'border-(--tenant-accent)/20 bg-(--tenant-accent)/[0.045]'}`} role="status">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Siguiente paso seguro</span><span className="rounded-full bg-surface-raised px-2 py-1 text-[10px] font-semibold text-ink-secondary">{projection.recovery.mode}</span></div>
      <p className="mt-1 text-sm font-semibold text-ink">{projection.recovery.title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-secondary">{projection.recovery.detail}</p>
      {recoveryDestination && <button type="button" onClick={() => onOpen(recoveryDestination)} className="mt-3 min-h-9 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-xs font-semibold text-ink hover:border-(--tenant-accent)/40 focus-visible:outline-2 focus-visible:outline-offset-2">{recoveryActionLabel}</button>}
    </div>}
    {blocked?.kind === 'conflict' && <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-4" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-amber-800 uppercase dark:text-amber-300">Decisión necesaria</span>
        <span className="text-xs font-semibold text-ink">{blocked.title}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">{blocked.detail}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-ink-muted">Repositorio</dt><dd className="mt-0.5 truncate font-medium text-ink" title={blocked.repository}>{blocked.repository}</dd></div>
        <div className="min-w-0"><dt className="text-ink-muted">Archivo en conflicto</dt><dd className="mt-0.5 truncate font-mono text-[11px] text-ink" title={blocked.file}>{blocked.file}</dd></div>
      </dl>
      <button type="button" onClick={() => onOpen('activity')} className="mt-3 min-h-10 rounded-xl border border-amber-500/30 bg-surface-raised px-3 text-xs font-semibold text-ink hover:border-amber-500/55 focus-visible:outline-2 focus-visible:outline-offset-2">Revisar ramas y actividad</button>
    </div>}
    <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border-subtle pt-4 text-xs">
      <div><dt className="text-ink-muted">Actualizaciones</dt><dd className={`mt-1 ${projection?.stale && !waitingForHumanDecision ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-ink'}`} title={signalTitle}>{waitingForHumanDecision ? 'En espera de tu decisión' : projection?.stale ? 'Señal obsoleta · revisar actividad' : connection === 'live' ? 'Canal en vivo' : 'Sin canal en vivo · consulta el último estado'}</dd></div>
      <div><dt className="text-ink-muted">Última señal durable</dt><dd className="mt-1 text-ink">{projection?.last_activity_at ? <time dateTime={projection.last_activity_at} title={new Date(projection.last_activity_at).toLocaleString('es-MX')}>{deliverySignalLabel(projection.last_activity_at)}</time> : 'Sin señal verificable'}</dd></div>
      <div><dt className="text-ink-muted">Responsable actual</dt><dd className="mt-1 text-ink">{projection?.actor?.type === 'human' ? 'Decisión humana' : projection?.actor?.type === 'system' ? 'Sistema' : projection?.actor?.model || item.assigned_agent || 'Agente'}</dd></div>
      <div><dt className="text-ink-muted">Agente asignado</dt><dd className="mt-1 text-ink">{assignedAgent}</dd></div>
      <div><dt className="text-ink-muted">Intentos registrados</dt><dd className="mt-1 text-ink">{item.automation_tasks?.length ?? 0}</dd></div>
      <div><dt className="text-ink-muted">Último cambio registrado</dt><dd className="mt-1 text-ink"><time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleString('es-MX')}</time></dd></div>
    </dl>
    {item.mandate && <section aria-label="Contrato de autonomía" className="mt-5 rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/[0.035] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-(--tenant-accent) uppercase">Contrato del agente · v{item.mandate.version}</p>
          <p className="mt-1 text-sm font-semibold text-ink">Autonomía acotada al resultado</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-secondary">El agente puede avanzar dentro de este alcance; si llega a un límite o necesita una decisión humana, se detiene y deja evidencia.</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">{item.mandate.max_concurrency} carril{item.mandate.max_concurrency === 1 ? '' : 'es'} simultáneo{item.mandate.max_concurrency === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-border-subtle bg-surface-raised/80 p-3"><p className="text-ink-muted">Puede hacer</p><p className="mt-1 font-medium text-ink">{(item.mandate.effective_allowed_tools ?? item.mandate.allowed_tools).length} capacidades permitidas</p></div>
        <div className="rounded-xl border border-border-subtle bg-surface-raised/80 p-3"><p className="text-ink-muted">Se detiene si</p><p className="mt-1 font-medium text-ink">{item.mandate.stop_conditions.length} límites operativos</p></div>
        <div className="rounded-xl border border-border-subtle bg-surface-raised/80 p-3"><p className="text-ink-muted">Requiere de ti</p><p className="mt-1 font-medium text-ink">{item.mandate.human_actions.length} decisiones explícitas</p></div>
      </div>
      <details className="mt-3 rounded-xl border border-border-subtle/80 bg-surface-raised/60 px-3 py-2">
        <summary className="min-h-9 cursor-pointer py-1 text-xs font-semibold text-ink">Ver límites y capacidades</summary>
        <div className="mt-2 grid gap-3 border-t border-border-subtle pt-3 text-[11px] leading-5 sm:grid-cols-2">
          <div><p className="font-semibold text-ink-secondary">Capacidades en esta fase</p><p className="mt-1 text-ink-muted">{(item.mandate.effective_allowed_tools ?? item.mandate.allowed_tools).join(' · ') || 'Ninguna: requiere revisión'}</p></div>
          <div><p className="font-semibold text-ink-secondary">Condiciones de parada</p><p className="mt-1 text-ink-muted">{item.mandate.stop_conditions.join(' · ')}</p></div>
          <div className="sm:col-span-2"><p className="font-semibold text-ink-secondary">Objetivo</p><p className="mt-1 text-ink-muted">{item.mandate.objective}</p></div>
        </div>
      </details>
    </section>}
  </section>
}
