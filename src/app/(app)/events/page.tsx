'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { Event } from '@/models/Event'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageTransition } from '@/components/ui/page-transition'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { EmptyState } from '@/components/ui/empty-state'
import { Square2StackIcon, PencilIcon } from '@heroicons/react/20/solid'

// Lazy-loaded modal
const EventFormModal = dynamic(
  () => import('@/components/events/forms/event-form-modal').then((m) => m.EventFormModal),
  { ssr: false }
)

export default function EventsPage() {
  // GET /api/events/cache/all → Redis key "all:events" → ListAllEvents()
  const { data: events = [], isLoading, error } = useSWR<Event[]>(
    '/events/cache/all',
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  const openNewEventModal = useCallback(() => {
    setSelectedEvent(null)
    setIsFormOpen(true)
  }, [])

  const openEditEventModal = useCallback((event: Event) => {
    setSelectedEvent(event)
    setIsFormOpen(true)
  }, [])

  if (error) {
    return (
      <div className="py-24 text-center text-sm text-red-400">
        Error al cargar eventos. Intenta de nuevo.
      </div>
    )
  }

  return (
    <PageTransition>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-sm:w-full sm:flex-1">
          <Heading>Eventos</Heading>
        </div>
        <Button onClick={openNewEventModal}>
          Crear evento
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-10 divide-y divide-white/5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-6">
              <div className="space-y-2.5">
                <div className="h-4 skeleton rounded w-48" />
                <div className="h-3 skeleton rounded w-64" />
                <div className="h-3 skeleton rounded w-32" />
              </div>
              <div className="flex items-center gap-3">
                <div className="size-7 skeleton rounded" />
                <div className="h-5 w-16 skeleton rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Square2StackIcon}
            title="Sin eventos"
            description="Esta organización aún no tiene eventos registrados."
          />
        </div>
      ) : (
        <AnimatedList>
          <ul className="mt-10">
            {events.map((event, index) => (
              <AnimatedListItem key={event.id}>
                <li>
                  <Divider soft={index > 0} />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-6 py-6">
                      <div className="space-y-1.5">
                        <div className="text-base/6 font-semibold">
                          <Link href={`/events/${event.id}`}>{event.name}</Link>
                        </div>
                        <div className="text-xs/6 text-zinc-500">
                          {event.event_date_time
                            ? new Date(event.event_date_time).toLocaleString('es-MX', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                          {event.address && (
                            <>
                              <span aria-hidden="true"> · </span>
                              {event.address}
                            </>
                          )}
                        </div>
                        <div className="text-xs/6 text-zinc-600">
                          {event.max_guests != null
                            ? `Máx. ${event.max_guests} invitados`
                            : 'Sin límite de invitados'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        plain
                        onClick={() => openEditEventModal(event)}
                        aria-label={`Editar ${event.name}`}
                      >
                        <PencilIcon className="size-4 text-zinc-400 hover:text-white" />
                      </Button>
                      <Badge color={event.is_active ? 'lime' : 'zinc'}>
                        {event.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                </li>
              </AnimatedListItem>
            ))}
          </ul>
        </AnimatedList>
      )}

      <EventFormModal
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        event={selectedEvent}
      />
    </PageTransition>
  )
}
