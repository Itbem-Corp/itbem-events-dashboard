export default function UsersLoading() {
    return (
        <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
            {/* Header skeleton */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-6">
                <div className="space-y-2">
                    <div className="h-7 skeleton rounded w-32" />
                    <div className="h-4 skeleton rounded w-64" />
                </div>
                <div className="h-9 skeleton rounded-lg w-36" />
            </div>

            {/* List skeleton */}
            <div className="grid grid-cols-1 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                        <div className="size-10 rounded-full skeleton shrink-0" />
                        <div className="flex-1 space-y-3">
                            <div className="h-4 skeleton rounded w-1/4" />
                            <div className="h-3 skeleton rounded w-1/3" />
                        </div>
                        <div className="flex gap-2">
                            <div className="size-8 rounded skeleton" />
                            <div className="size-8 rounded skeleton" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
