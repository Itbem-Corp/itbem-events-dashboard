export default function ClientsLoading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Cargando organizaciones">
      <span className="sr-only">Cargando organizaciones…</span>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-9 w-32 rounded-lg" />
          <div className="skeleton h-3 w-80 max-w-[75vw] rounded" />
        </div>
        <div className="skeleton h-10 w-full rounded-lg sm:w-36" />
      </header>
      <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-2">
        <div className="skeleton h-9 w-full rounded-xl sm:w-72" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex items-center gap-4 border-b border-white/6 p-4 last:border-0 sm:p-5">
            <div className="skeleton size-12 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <div className="skeleton h-4 w-44 rounded" />
              <div className="skeleton h-3 w-28 rounded" />
            </div>
            <div className="skeleton hidden h-8 w-24 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
