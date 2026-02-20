export default function OrdersLoading() {
    return (
        <div className="space-y-6">
            <div className="h-7 skeleton rounded w-24" />

            <div className="mt-8 space-y-0">
                {/* Table header skeleton */}
                <div className="flex gap-4 py-3 border-b border-white/10">
                    {[120, 140, 100, 100, 80].map((w, i) => (
                        <div key={i} className={`h-3 skeleton rounded`} style={{ width: w }} />
                    ))}
                </div>
                {/* Rows */}
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 py-4 border-b border-white/5">
                        {[120, 140, 100, 100, 80].map((w, j) => (
                            <div key={j} className="h-4 skeleton rounded" style={{ width: w }} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
