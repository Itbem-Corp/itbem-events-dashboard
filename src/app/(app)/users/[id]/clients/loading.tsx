export default function UserClientsLoading() {
  return (
    <div className="space-y-8" aria-label="Cargando membresías del usuario" role="status">
      <div className="skeleton h-4 w-20 rounded" />
      <div className="flex items-center gap-4 border-b border-white/7 pb-7">
        <div className="skeleton size-14 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <div className="skeleton h-7 w-56 max-w-2/3 rounded" />
          <div className="skeleton h-3 w-44 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-white/7 bg-white/[0.02] p-4 sm:p-5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton mt-3 h-7 w-10 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-4 rounded-2xl border border-white/7 bg-white/[0.02] p-5">
            <div className="skeleton size-12 rounded-xl" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
