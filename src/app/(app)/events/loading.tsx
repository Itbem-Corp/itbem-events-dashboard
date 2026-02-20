export default function EventsLoading() {
    return (
        <div className="space-y-6 py-6">
            {/* Header skeleton */}
            <div className="flex items-end justify-between gap-4">
                <div className="h-7 skeleton rounded w-24" />
                <div className="h-9 skeleton rounded-lg w-32" />
            </div>

            {/* List skeleton */}
            <div className="mt-4 space-y-0">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-6 py-6 border-t border-white/5">
                        <div className="flex-1 space-y-3 py-1">
                            <div className="h-4 skeleton rounded w-1/3" />
                            <div className="h-3 skeleton rounded w-1/2" />
                            <div className="h-3 skeleton rounded w-1/4" />
                        </div>
                        <div className="h-6 skeleton rounded w-16 self-center" />
                    </div>
                ))}
            </div>
        </div>
    )
}
