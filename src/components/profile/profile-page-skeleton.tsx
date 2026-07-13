export function ProfilePageSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Cargando perfil" aria-busy="true">
      <span className="sr-only">Cargando perfil…</span>
      <div className="space-y-2">
        <div className="skeleton h-8 w-32 rounded-lg motion-reduce:animate-none" />
        <div className="skeleton h-4 w-full max-w-sm rounded motion-reduce:animate-none" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-5 rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
          <div className="skeleton h-5 w-28 rounded motion-reduce:animate-none" />
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="skeleton size-32 rounded-3xl motion-reduce:animate-none sm:size-36" />
            <div className="skeleton h-4 w-32 rounded motion-reduce:animate-none" />
            <div className="skeleton h-9 w-full rounded-lg motion-reduce:animate-none" />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
            <div className="skeleton mb-5 h-5 w-40 rounded motion-reduce:animate-none" />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {[0, 1, 2].map((field) => (
                <div key={field} className={field === 2 ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
                  <div className="skeleton h-4 w-20 rounded motion-reduce:animate-none" />
                  <div className="skeleton h-10 w-full rounded-lg motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
          <div className="skeleton h-48 rounded-2xl motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}
