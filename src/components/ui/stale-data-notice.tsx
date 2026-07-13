'use client'

import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'

interface StaleDataNoticeProps {
  label: string
  onRetry: () => void
  retrying?: boolean
}

export function StaleDataNotice({ label, onRetry, retrying = false }: StaleDataNoticeProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 text-amber-100/80 sm:items-center">
        <ExclamationTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-300 sm:mt-0" />
        <p>Mostrando datos guardados mientras recuperamos {label}.</p>
      </div>
      <button type="button" onClick={onRetry} disabled={retrying} aria-busy={retrying} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-wait disabled:opacity-60 sm:self-auto">
        <ArrowPathIcon aria-hidden="true" className={`size-4 ${retrying ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        {retrying ? 'Actualizando…' : 'Reintentar'}
      </button>
    </div>
  )
}
