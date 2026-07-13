'use client'

import { Button } from '@/components/button'
import { EventDetailPanelSkeleton } from '@/components/events/event-detail-panel-skeleton'
import type { EventDetailTabId } from '@/components/events/event-detail-tabs'
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'

interface EventGuestCollectionBoundaryProps {
  tab: Exclude<EventDetailTabId, 'resumen'>
  isLoading: boolean
  error?: unknown
  onRetry: () => void
  children: ReactNode
}

export function EventGuestCollectionBoundary({
  tab,
  isLoading,
  error,
  onRetry,
  children,
}: EventGuestCollectionBoundaryProps) {
  if (isLoading) return <EventDetailPanelSkeleton tab={tab} />

  if (error) {
    return (
      <section role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-6 text-center">
        <p className="text-sm font-medium text-zinc-200">No se pudo cargar la colección de invitados.</p>
        <p className="mt-1 text-sm text-zinc-500">
          Este panel falló de forma aislada; puedes reintentarlo sin recargar el evento.
        </p>
        <Button outline className="mt-4" onClick={onRetry}>
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          Reintentar panel
        </Button>
      </section>
    )
  }

  return children
}
