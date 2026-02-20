export default function OrderDetailLoading() {
    return (
        <div className="space-y-6 mt-4">
            <div className="h-4 w-20 skeleton rounded" />
            <div className="h-8 skeleton rounded w-40" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-2">
                        <div className="h-3 skeleton rounded w-20" />
                        <div className="h-8 skeleton rounded w-16" />
                    </div>
                ))}
            </div>
        </div>
    )
}
