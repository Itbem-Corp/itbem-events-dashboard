'use client'

import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import {
  legacyCombinedWorkerCount,
  projectAgentLaneHealth,
  type AutomationHealth,
} from '@/features/automation/agent-lane-health'

type AgentLaneHealthPanelProps = {
  health?: AutomationHealth
  loading?: boolean
  validating?: boolean
  unavailable?: boolean
  onRefresh: () => void
}

export function AgentLaneHealthPanel({ health, loading = false, validating = false, unavailable = false, onRefresh }: AgentLaneHealthPanelProps) {
  const lanes = projectAgentLaneHealth(health)
  const legacyWorkers = legacyCombinedWorkerCount(health)

  return (
    <section aria-labelledby="agent-team-title" className="premium-surface overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
        <div>
          <h2 id="agent-team-title" className="text-xs font-bold tracking-[.14em] text-ink-muted uppercase">Equipo multiagente</h2>
          <p className="mt-1 text-[11px] text-ink-muted">Pulso operacional · cada 30 s</p>
        </div>
        <button
          type="button"
          aria-label="Actualizar estado del equipo multiagente"
          onClick={onRefresh}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
        >
          <ArrowPathIcon className={`size-4 ${validating ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>
      </div>

      {unavailable ? (
        <div role="status" className="flex items-start gap-3 px-4 py-4">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-5 text-ink-muted">No hay evidencia reciente del equipo. Los permisos de merge y release permanecen sin confirmar.</p>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Cargando estado del equipo multiagente" className="space-y-3 px-4 py-4">
          {[0, 1, 2].map((index) => <div key={index} className="h-9 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />)}
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle" aria-label="Estado por lane">
          {lanes.map((lane) => (
            <li key={lane.lane} className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${lane.state === 'operational' ? 'bg-emerald-500' : lane.state === 'attention' ? 'bg-rose-500' : 'bg-amber-400'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">{lane.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-ink-muted">
                    {lane.workers === null
                      ? 'Worker: sin evidencia'
                      : lane.workers === 0
                        ? 'Worker no detectado'
                        : `${lane.workers} worker${lane.workers === 1 ? '' : 's'} · capacidad ${lane.capacity}`}
                  </p>
                  <p className="text-[11px] leading-4 text-ink-muted">
                    {!lane.queue
                      ? 'Cola: sin evidencia'
                      : !lane.queue.available
                        ? 'Cola: telemetría no disponible'
                        : `Cola: ${lane.queue.visible} espera · ${lane.queue.in_flight} activo${lane.queue.in_flight === 1 ? '' : 's'} · ${lane.queue.delayed} diferido${lane.queue.delayed === 1 ? '' : 's'}`}
                  </p>
                  <p className="text-[11px] leading-4 text-ink-muted">
                    {lane.preflight
                      ? `Preflight: ${lane.preflight.ready}/${lane.preflight.total} workspace${lane.preflight.total === 1 ? '' : 's'} listo${lane.preflight.total === 1 ? '' : 's'}`
                      : 'Preflight: sin evidencia'}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!unavailable && !loading ? (
        <div className="border-t border-border-subtle px-4 py-3 text-[11px] leading-4 text-ink-muted">
          {legacyWorkers > 0 ? <p className="mb-1 text-amber-700">{legacyWorkers} worker combinado legado permanece visible durante la migración.</p> : null}
          Estado operacional; no concede autoridad de merge ni release.
        </div>
      ) : null}
    </section>
  )
}
