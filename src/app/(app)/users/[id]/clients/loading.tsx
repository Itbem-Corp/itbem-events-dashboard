export default function UserClientsLoading() {
    return (
        <div className="space-y-6 mt-4">
            <div className="h-4 w-20 skeleton rounded" />
            <div className="h-7 skeleton rounded w-48" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-3">
                        <div className="size-12 skeleton rounded-xl" />
                        <div className="h-4 skeleton rounded w-3/4" />
                        <div className="h-3 skeleton rounded w-1/2" />
                    </div>
                ))}
            </div>
        </div>
    )
}
