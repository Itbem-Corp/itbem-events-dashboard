'use client'

import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import type { GuestSummary } from '@/models/GuestSummary'
import { ArrowPathIcon, UsersIcon } from '@heroicons/react/20/solid'

interface EventGuestSummaryProps {
  summary: GuestSummary | null
  isLoading: boolean
  error?: unknown
  onRetry: () => void
  onOpenGuests?: () => void
}

export function EventGuestSummary({ summary, isLoading, error, onRetry, onOpenGuests }: EventGuestSummaryProps) {
  if (isLoading) {
    return (
      <section aria-labelledby="event-guest-summary-title" role="status" aria-live="polite" aria-busy="true">
        <Subheading id="event-guest-summary-title">Resumen de invitados</Subheading>
        <span className="sr-only">Cargando resumen de invitados…</span>
        <div aria-hidden="true" className="mt-3 grid animate-pulse gap-3 motion-reduce:animate-none sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 rounded-xl border border-white/5 bg-zinc-900/70" />
          ))}
        </div>
      </section>
    )
  }

  if (error || !summary) {
    return (
      <section
        aria-labelledby="event-guest-summary-title"
        role="alert"
        className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5"
      >
        <Subheading id="event-guest-summary-title">Resumen de invitados no disponible</Subheading>
        <p className="mt-1 text-sm text-zinc-400">
          El resto del evento sigue disponible. Reintenta solo estas métricas.
        </p>
        <Button outline className="mt-4" onClick={onRetry}>
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          Reintentar resumen
        </Button>
      </section>
    )
  }

  if (summary.total === 0) {
    return (
      <section className="rounded-xl border border-dashed border-white/10 p-8 text-center">
        <UsersIcon aria-hidden="true" className="mx-auto mb-3 size-8 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">Sin invitados aún</p>
        <p className="mt-1 text-sm text-zinc-600">
          {onOpenGuests ? 'Agrega invitados desde la pestaña “Invitados”.' : 'No tienes acceso al directorio de invitados.'}
        </p>
        {onOpenGuests && (
          <Button className="mt-4" onClick={onOpenGuests}>
            Ir a invitados
          </Button>
        )}
      </section>
    )
  }

  const stats = [
    { label: 'Confirmados', value: summary.confirmed, color: 'text-lime-400' },
    { label: 'Pendientes', value: summary.pending, color: 'text-amber-400' },
    { label: 'Declinados', value: summary.declined, color: 'text-pink-400' },
  ]

  return (
    <section aria-labelledby="event-guest-summary-title">
      <Subheading id="event-guest-summary-title">Resumen de invitados</Subheading>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4"
          >
            <span className="text-sm text-zinc-400">{stat.label}</span>
            <span className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
