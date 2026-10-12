'use client'

import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { ArrowPathIcon, ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/20/solid'

interface EventCapabilityErrorProps {
  title: string
  description: string
  onRetry: () => void
  retrying?: boolean
  /** Full-page variant (Studio, check-in) shows a way back. */
  backHref?: string
  retryLabel?: string
}

/**
 * The event's permissions could not be loaded (network error or 5xx). This is
 * not a denial: it says so and offers Reintentar. Used by the event detail,
 * Studio and check-in; a real 403 shows the screen's own lock card instead.
 */
export function EventCapabilityError({
  title,
  description,
  onRetry,
  retrying = false,
  backHref,
  retryLabel = 'Reintentar',
}: EventCapabilityErrorProps) {
  const retryButton = (
    <Button
      outline
      className="min-h-11 w-full shrink-0 sm:w-auto"
      onClick={onRetry}
      disabled={retrying}
      aria-busy={retrying}
    >
      <ArrowPathIcon aria-hidden="true" className={retrying ? 'animate-spin motion-reduce:animate-none' : undefined} />
      {retrying ? 'Reintentando…' : retryLabel}
    </Button>
  )

  if (backHref) {
    return (
      <div role="alert" className="premium-surface max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] text-amber-300">
          <ExclamationTriangleIcon aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          {retryButton}
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink-secondary transition-colors hover:text-ink"
          >
            Volver al evento
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="mt-5 flex flex-col gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
          <ExclamationTriangleIcon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-100">{title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">{description}</p>
        </div>
      </div>
      {retryButton}
    </div>
  )
}

export function EventNotFoundCard({ backHref = '/events', backLabel = 'Volver a eventos' }: { backHref?: string; backLabel?: string }) {
  return (
    <div role="alert" className="premium-surface max-w-md rounded-3xl p-8 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Evento no encontrado</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">Puede que se haya eliminado o que el enlace sea incorrecto.</p>
      <Link
        href={backHref}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        {backLabel}
      </Link>
    </div>
  )
}

/** The caller lost access to the event (403 on the detail). */
export function EventAccessLost({ eventsLabel }: { eventsLabel: string }) {
  return (
    <div className="flex justify-center px-4 py-16">
      <div role="alert" className="premium-surface max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] text-amber-300">
          <LockClosedIcon aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">Ya no tienes acceso a este evento</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Quien administra el evento cambió tu acceso. Si crees que es un error, pídele que te lo vuelva a asignar.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Volver a {eventsLabel}
        </Link>
      </div>
    </div>
  )
}
