export default function UsersLoading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Cargando equipo y accesos">
      <span className="sr-only">Cargando equipo y accesos…</span>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="skeleton h-3 w-36 rounded" />
          <div className="skeleton h-9 w-36 rounded-lg" />
          <div className="skeleton h-3 w-80 max-w-[75vw] rounded" />
        </div>
        <div className="skeleton h-10 w-40 rounded-lg" />
      </header>
      <div className="flex gap-1 rounded-2xl border border-white/7 bg-white/[0.02] p-1.5">
        {[72, 78, 88, 64].map((width) => <div key={width} className="skeleton h-8 rounded-lg" style={{ width }} />)}
      </div>
      <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-2">
        <div className="skeleton h-9 w-full rounded-xl sm:w-72" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex items-center gap-4 border-b border-white/6 p-4 last:border-0 sm:p-5">
            <div className="skeleton size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2.5">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-52 max-w-[50vw] rounded" />
            </div>
            <div className="skeleton hidden h-7 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
