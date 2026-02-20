'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useParams } from 'next/navigation'
import type { Event } from '@/models/Event'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { PageTransition } from '@/components/ui/page-transition'
import { motion } from 'motion/react'

// Lazy-loaded modal
const EventFormModal = dynamic(
  () => import('@/components/events/forms/event-form-modal').then((m) => m.EventFormModal),
  { ssr: false }
)

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [isEditOpen, setIsEditOpen] = useState(false)

  const { data: event, isLoading, error } = useSWR<Event>(
    id ? `/events/${id}` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="h-4 w-24 skeleton rounded" />
        <div className="h-8 w-64 skeleton rounded" />
        <div className="h-4 w-48 skeleton rounded" />
        <div className="grid gap-8 sm:grid-cols-3 mt-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="py-24 text-center text-sm text-red-400">
        No se pudo cargar el evento. Verifica que exista o intenta de nuevo.
      </div>
    )
  }

  return (
    <PageTransition>
      <div className="max-lg:hidden">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500">
          <ChevronLeftIcon className="size-4 fill-zinc-500" />
          Eventos
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Heading>{event.name}</Heading>
          <Badge color={event.is_active ? 'lime' : 'zinc'}>
            {event.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
        <div className="flex gap-4">
          <Button outline onClick={() => setIsEditOpen(true)}>Editar</Button>
        </div>
      </div>

      <div className="mt-2 text-sm/6 text-zinc-500">
        {event.event_date_time
          ? new Date(event.event_date_time).toLocaleString('es-MX', {
              dateStyle: 'long',
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

      {event.description && (
        <p className="mt-4 text-sm text-zinc-400">{event.description}</p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Máx. invitados', value: event.max_guests != null ? String(event.max_guests) : '—' },
          { label: 'Zona horaria', value: event.timezone || '—' },
          { label: 'Tipo de evento', value: event.event_type?.name || '—' },
          { label: 'Organizador', value: event.organizer_name || '—' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            className="rounded-xl border border-white/10 bg-zinc-900/50 p-5"
          >
            <p className="text-xs text-zinc-400 uppercase font-semibold">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <Subheading className="mt-12">Órdenes</Subheading>
      <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400">
        Las órdenes estarán disponibles cuando se conecte el módulo de pagos.
      </div>

      <EventFormModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        event={event}
      />
    </PageTransition>
  )
}
