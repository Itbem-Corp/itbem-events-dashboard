import type { PanelId } from '@/components/studio/studio-constants'

interface StudioPanelSkeletonProps {
  panel: PanelId
}

const PANEL_LABELS: Record<PanelId, string> = {
  sections: 'secciones',
  config: 'ajustes',
  design: 'diseño',
}

export function StudioPanelSkeleton({ panel }: StudioPanelSkeletonProps) {
  const label = PANEL_LABELS[panel]

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3 py-1">
      <span className="sr-only">Cargando {label}…</span>
      <div aria-hidden="true" className="animate-pulse space-y-3 motion-reduce:animate-none">
        {panel === 'design' ? (
          <>
            <div className="h-3 w-4/5 rounded bg-surface-raised/80" />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="aspect-[4/3] rounded-xl border border-white/5 bg-surface" />
              ))}
            </div>
            <div className="h-9 rounded-lg bg-surface-raised/70" />
          </>
        ) : panel === 'config' ? (
          [...Array(7)].map((_, item) => (
            <div key={item} className="flex items-center justify-between gap-3 rounded-lg py-1.5">
              <div className="h-3 w-28 rounded bg-surface-raised/80" />
              <div className="h-5 w-9 rounded-full bg-surface-raised" />
            </div>
          ))
        ) : (
          [...Array(5)].map((_, item) => (
            <div
              key={item}
              className="flex h-14 items-center gap-3 rounded-xl border border-white/5 bg-surface/70 px-3"
            >
              <div className="size-8 rounded-lg bg-surface-raised" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-surface-raised" />
                <div className="h-2.5 w-1/3 rounded bg-surface-raised/70" />
              </div>
              <div className="h-5 w-9 rounded-full bg-surface-raised" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
