import type { EventDetailTabId } from '@/components/events/event-detail-tabs'

interface EventDetailPanelSkeletonProps {
  tab: Exclude<EventDetailTabId, 'resumen'>
}

const TAB_LABELS: Record<Exclude<EventDetailTabId, 'resumen'>, string> = {
  invitados: 'invitados',
  invitaciones: 'invitaciones',
  asientos: 'mesas',
  rsvp: 'RSVP',
  momentos: 'momentos',
  analiticas: 'analíticas',
  configuracion: 'configuración',
}

export function EventDetailPanelSkeleton({ tab }: EventDetailPanelSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
      <span className="sr-only">Cargando {TAB_LABELS[tab]}…</span>
      <div aria-hidden="true" className="animate-pulse space-y-5 motion-reduce:animate-none">
        {tab === 'invitados' ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-20 rounded-xl border border-white/5 bg-zinc-900/70" />
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="h-10 min-w-56 flex-1 rounded-lg bg-zinc-900/80" />
              <div className="h-10 w-64 rounded-lg bg-zinc-900/80" />
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex h-14 items-center gap-4 border-b border-white/5 px-4 last:border-0">
                  <div className="size-4 rounded bg-zinc-800" />
                  <div className="h-3 flex-1 rounded bg-zinc-800" />
                  <div className="h-3 w-24 rounded bg-zinc-800/80" />
                  <div className="h-6 w-20 rounded-md bg-zinc-800" />
                </div>
              ))}
            </div>
          </>
        ) : tab === 'configuracion' ? (
          [0, 1, 2].map((item) => (
            <div key={item} className="space-y-3 border-b border-white/10 pb-7 last:border-0">
              <div className="h-4 w-40 rounded bg-zinc-800" />
              <div className="h-3 w-3/5 rounded bg-zinc-800/70" />
              <div className="h-24 rounded-xl border border-white/5 bg-zinc-900/70" />
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-4 w-40 rounded bg-zinc-800" />
                <div className="h-3 w-64 max-w-full rounded bg-zinc-800/70" />
              </div>
              <div className="h-9 w-24 rounded-lg bg-zinc-800" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-32 rounded-xl border border-white/5 bg-zinc-900/70" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
