export default function EventDetailLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Cargando centro de operación">
      <span className="sr-only">Cargando centro de operación…</span>

      <div className="pt-1">
        <div className="skeleton mb-5 h-4 w-20 rounded" />
        <div className="skeleton h-3 w-36 rounded" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="skeleton h-10 w-72 max-w-[70vw] rounded-lg" />
          <div className="skeleton h-6 w-16 rounded-full" />
          <div className="skeleton h-6 w-24 rounded-full" />
        </div>
        <div className="skeleton mt-4 h-4 w-96 max-w-[80vw] rounded" />
        <div className="mt-6 flex gap-3">
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-28 rounded-lg" />
          <div className="skeleton h-9 w-32 rounded-lg" />
        </div>
      </div>

      <div className="pt-2">
        <div className="skeleton mb-3 h-3 w-36 rounded" />
        <div className="flex gap-2 overflow-hidden border-b border-white/8 pb-3">
          {[72, 88, 96, 80, 92].map((width, item) => (
            <div key={item} className="skeleton h-8 shrink-0 rounded-lg" style={{ width }} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-2xl border border-white/7 bg-white/[0.025] p-5">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-5 h-8 w-16 rounded" />
          </div>
        ))}
      </div>

      <div className="space-y-4 pt-5">
        <div className="skeleton h-5 w-36 rounded" />
        <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-5">
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton mt-3 h-3 w-72 max-w-[70vw] rounded" />
          <div className="skeleton mt-2 h-3 w-56 rounded" />
        </div>
      </div>
    </div>
  )
}
