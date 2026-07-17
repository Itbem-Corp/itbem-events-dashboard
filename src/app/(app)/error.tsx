'use client'

import { Button } from '@/components/button'
import { ArrowPathIcon, HomeIcon } from '@heroicons/react/20/solid'
import { useEffect } from 'react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[DashboardRouteError]', error)
  }, [error])

  return (
    <section className="flex min-h-[62vh] items-center justify-center py-12" role="alert" aria-live="polite">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-canvas/70 p-7 shadow-2xl shadow-black/20 sm:p-10">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-red-500/[0.07] via-transparent to-indigo-500/[0.06]" />
        <div className="relative">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-red-400/15 bg-red-500/10 text-red-300">
            <span className="text-lg font-semibold">!</span>
          </span>
          <p className="mt-7 text-[11px] font-semibold tracking-[0.18em] text-red-300 uppercase">Interrupción temporal</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Esta vista no pudo terminar de cargar
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-secondary">
            Tu información está segura. Reintenta la operación o vuelve al centro de operaciones para continuar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button color="indigo" onClick={reset}>
              <ArrowPathIcon />
              Reintentar
            </Button>
            <Button href="/" outline>
              <HomeIcon />
              Ir al dashboard
            </Button>
          </div>
          {error.digest && <p className="mt-6 font-mono text-[10px] text-ink-muted">Referencia {error.digest}</p>}
        </div>
      </div>
    </section>
  )
}
