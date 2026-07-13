interface IntentModalSkeletonProps {
  title?: string
}

export function IntentModalSkeleton({ title = 'Preparando formulario' }: IntentModalSkeletonProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy="true"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">{title}…</span>
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />
            <div className="h-2.5 w-56 max-w-[60vw] animate-pulse rounded bg-zinc-900" />
          </div>
          <div className="size-8 animate-pulse rounded-lg bg-zinc-900" />
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className={item > 1 ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
              <div className="h-2.5 w-20 animate-pulse rounded bg-zinc-800" />
              <div className="h-10 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80" />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-900" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-indigo-500/25" />
        </div>
      </div>
    </div>
  )
}
