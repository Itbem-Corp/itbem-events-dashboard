export default function EventDetailLoading() {
    return (
        <div className="space-y-6 mt-4">
            {/* Back link skeleton */}
            <div className="h-4 w-20 skeleton rounded" />

            {/* Title + badge */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-8 skeleton rounded w-48" />
                    <div className="h-6 skeleton rounded-full w-16" />
                </div>
                <div className="h-9 skeleton rounded-lg w-24" />
            </div>

            {/* Date / address */}
            <div className="h-4 skeleton rounded w-64" />

            {/* Description */}
            <div className="h-4 skeleton rounded w-96" />

            {/* Stat cards */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
                        <div className="h-3 skeleton rounded w-20" />
                        <div className="h-8 skeleton rounded w-12" />
                    </div>
                ))}
            </div>

            {/* Orders section */}
            <div className="mt-12 h-5 skeleton rounded w-24" />
            <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 h-20 skeleton" />
        </div>
    )
}
