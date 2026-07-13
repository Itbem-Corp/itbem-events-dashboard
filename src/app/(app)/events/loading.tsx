export default function EventsLoading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Cargando portafolio de eventos">
      <span className="sr-only">Cargando portafolio de eventos…</span>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton h-9 w-36 rounded-lg" />
          <div className="skeleton h-3 w-80 max-w-[75vw] rounded" />
        </div>
        <div className="skeleton h-10 w-36 rounded-lg" />
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/7 bg-white/[0.02] p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {[72, 88, 58, 76].map((width) => <div key={width} className="skeleton h-8 rounded-lg" style={{ width }} />)}
        </div>
        <div className="skeleton h-9 w-full rounded-xl sm:w-64" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex items-center gap-4 border-b border-white/6 p-4 last:border-0 sm:p-5">
            <div className="skeleton size-12 shrink-0 rounded-xl sm:size-16" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="skeleton h-4 w-44 max-w-[50vw] rounded" />
              <div className="skeleton h-3 w-64 max-w-[55vw] rounded" />
              <div className="skeleton h-2.5 w-32 rounded" />
            </div>
            <div className="skeleton hidden h-7 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
