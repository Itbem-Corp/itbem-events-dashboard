import type React from 'react'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-product-shell relative min-h-dvh overflow-hidden bg-[#090a0c] p-1 sm:p-2">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--tenant-accent)_8%,transparent),transparent_42%)]" />
      <div className="relative min-h-[calc(100dvh-0.5rem)]">{children}</div>
    </main>
  )
}
