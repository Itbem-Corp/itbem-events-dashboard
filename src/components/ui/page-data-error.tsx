'use client'

import { Button } from '@/components/button'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'

interface PageDataErrorProps {
  title: string
  description: string
  onRetry: () => void
  retrying?: boolean
  icon?: React.ComponentType<{ className?: string }>
}

export function PageDataError({
  title,
  description,
  onRetry,
  retrying = false,
  icon: Icon = ExclamationTriangleIcon,
}: PageDataErrorProps) {
  return (
    <section className="flex min-h-[56vh] items-center justify-center py-10" role="alert" aria-live="polite">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-red-400/15 bg-canvas/70 p-7 text-center shadow-2xl shadow-black/15 sm:p-9">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-red-500/[0.07] via-transparent to-indigo-500/[0.05]" />
        <div className="relative">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-red-400/10 bg-red-500/10 text-red-300">
            <Icon className="size-5" />
          </span>
          <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-red-300 uppercase">Conexión interrumpida</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-secondary">{description}</p>
          <Button color="indigo" className="mt-7" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
            <ArrowPathIcon className={retrying ? 'animate-spin motion-reduce:animate-none' : undefined} />
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      </div>
    </section>
  )
}
