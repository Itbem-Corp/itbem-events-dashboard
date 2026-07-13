export default function HomeLoading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Cargando centro de operaciones">
      <span className="sr-only">Cargando centro de operaciones…</span>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton h-9 w-44 rounded-lg" />
          <div className="skeleton h-3 w-80 max-w-[75vw] rounded" />
        </div>
        <div className="skeleton h-10 w-36 rounded-lg" />
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-h-64 rounded-3xl border border-white/7 bg-white/[0.025] p-6 lg:col-span-8 lg:p-8">
          <div className="skeleton h-5 w-28 rounded-full" />
          <div className="skeleton mt-6 h-10 w-80 max-w-[70vw] rounded-lg" />
          <div className="skeleton mt-4 h-4 w-56 rounded" />
          <div className="mt-20 flex items-center justify-between gap-4 border-t border-white/7 pt-5">
            <div className="skeleton h-3 w-52 rounded" />
            <div className="skeleton h-9 w-28 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="rounded-2xl border border-white/7 bg-white/[0.025] p-4">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton mt-7 h-8 w-14 rounded" />
              <div className="skeleton mt-2 h-2.5 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-10 pt-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]">
        <section className="space-y-4">
          <div className="skeleton h-5 w-32 rounded" />
          <div className="overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center gap-4 border-b border-white/6 px-5 py-4 last:border-0">
                <div className="skeleton size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-40 rounded" />
                  <div className="skeleton h-2.5 w-56 max-w-[50vw] rounded" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="skeleton h-5 w-24 rounded" />
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </aside>
      </div>
    </div>
  )
}
