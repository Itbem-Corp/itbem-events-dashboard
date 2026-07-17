import type React from 'react'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-product-shell relative min-h-dvh overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text-primary)] transition-colors duration-300 motion-reduce:transition-none">
      <div className="relative min-h-dvh">{children}</div>
    </main>
  )
}
