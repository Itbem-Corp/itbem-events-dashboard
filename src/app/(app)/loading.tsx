export default function HomeLoading() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div className="h-7 skeleton rounded w-32" />
            </div>

            {/* KPI cards */}
            <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 skeleton rounded-xl" />
                ))}
            </div>

            {/* Table */}
            <div className="mt-14 space-y-4">
                <div className="h-5 skeleton rounded w-36" />
                <div className="rounded-xl border border-white/10 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex gap-6 px-4 py-3 border-b border-white/5">
                            <div className="h-4 skeleton rounded w-1/3" />
                            <div className="h-4 skeleton rounded w-1/4" />
                            <div className="h-4 skeleton rounded w-1/6" />
                            <div className="h-4 skeleton rounded w-1/6" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
