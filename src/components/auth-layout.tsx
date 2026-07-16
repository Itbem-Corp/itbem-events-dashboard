import type React from 'react'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-[radial-gradient(circle_at_top,#18181b_0%,#09090b_46%)] p-2">
      <div className="flex grow items-center justify-center p-3 sm:p-6 lg:p-10">
        {children}
      </div>
    </main>
  )
}
