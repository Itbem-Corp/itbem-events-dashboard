// Shown instead of a guarded route while the route policy decides, so a page
// the user cannot open never mounts and never requests its data.
export function RouteGuardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Verificando acceso" aria-busy="true">
      <span className="sr-only">Verificando acceso…</span>
      <div className="space-y-3">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-4 w-full max-w-md rounded" />
      </div>
      <div className="space-y-3 rounded-2xl border border-border-subtle p-4 sm:p-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-4 py-2">
            <div className="skeleton size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/5 rounded" />
              <div className="skeleton h-3 w-1/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
