'use client'

import { useStoreHydration } from '@/hooks/useStoreHydration'
import type { ReactNode } from 'react'

function HydrationSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Preparando dashboard" aria-busy="true">
      <span className="sr-only">Preparando dashboard…</span>
      <div className="space-y-3">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-full max-w-md rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-white/7 bg-white/[0.02] p-4 sm:p-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-4 py-2">
            <div className="skeleton size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/5 rounded" />
              <div className="skeleton h-3 w-1/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StoreHydrationBoundary({ children }: { children: ReactNode }) {
  const hydrated = useStoreHydration()

  return hydrated ? children : <HydrationSkeleton />
}
