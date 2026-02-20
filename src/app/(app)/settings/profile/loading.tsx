export default function ProfileLoading() {
    return (
        <div className="mx-auto max-w-6xl px-4 py-8">
            {/* Heading */}
            <div className="h-7 skeleton rounded w-28" />
            <div className="mt-2 h-4 skeleton rounded w-80" />

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Avatar section */}
                <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 space-y-4">
                    <div className="h-4 skeleton rounded w-28" />
                    <div className="flex flex-col items-center gap-4 pt-2">
                        <div className="size-24 rounded-full skeleton" />
                        <div className="h-8 skeleton rounded-lg w-full" />
                    </div>
                </div>

                {/* Form section */}
                <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <div className="h-4 skeleton rounded w-16" />
                            <div className="h-9 skeleton rounded-lg w-full" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 skeleton rounded w-20" />
                            <div className="h-9 skeleton rounded-lg w-full" />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <div className="h-4 skeleton rounded w-36" />
                            <div className="h-9 skeleton rounded-lg w-full" />
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end">
                        <div className="h-9 skeleton rounded-lg w-36" />
                    </div>
                </div>
            </div>
        </div>
    )
}
