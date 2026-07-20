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
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-[0_18px_48px_var(--app-shadow-strong)]"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">{title}…</span>
            <div className="h-4 w-40 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
            <div className="h-2.5 w-56 max-w-[60vw] animate-pulse rounded bg-surface-interactive motion-reduce:animate-none" />
          </div>
          <div className="size-8 animate-pulse rounded-lg bg-surface-interactive motion-reduce:animate-none" />
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className={item > 1 ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-xl border border-border-subtle bg-surface-interactive motion-reduce:animate-none" />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-surface-interactive motion-reduce:animate-none" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-(--tenant-accent)/20 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}
