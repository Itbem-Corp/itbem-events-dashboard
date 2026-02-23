'use client'

import { StatCard } from '@/components/ui/stat-card'
import { PageTransition } from '@/components/ui/page-transition'
import { Heading, Subheading } from '@/components/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table'
import { fetcher } from '@/lib/fetcher'
import { eventTypeLabel } from '@/lib/event-type-label'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'
import { Link } from '@/components/link'
import { Badge } from '@/components/badge'
import { CalendarDaysIcon, BoltIcon, PaintBrushIcon, UsersIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/20/solid'

function getDaysUntil(dateString: string): number {
  const now = new Date()
  const eventDate = new Date(dateString)
  return Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatEventDate(dateString: string, timeZone: string) {
  return new Date(dateString).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || 'UTC',
  })
}

export default function Home() {
  const { data: events = [], isLoading } = useSWR<Event[]>('/events/all', fetcher)

  const activeEvents = events.filter((e) => e.is_active)
  const upcomingEvents = activeEvents
    .filter((e) => getDaysUntil(e.event_date_time) >= 0)
    .sort((a, b) => new Date(a.event_date_time).getTime() - new Date(b.event_date_time).getTime())
  const nextEvent = upcomingEvents[0]
  const totalCapacity = events.reduce((sum, e) => sum + (e.max_guests ?? 0), 0)

  // Load guests for the next event
  const { data: rawNextGuests } = useSWR(
    nextEvent?.id ? `/guests/all:${nextEvent.id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const nextEventGuests: Guest[] = Array.isArray(rawNextGuests) ? rawNextGuests : (rawNextGuests?.data ?? rawNextGuests ?? [])
  const nextEventConfirmed = nextEventGuests.filter((g) => g.status?.code === 'CONFIRMED').length
  const nextEventPending = nextEventGuests.filter((g) => g.status?.code === 'PENDING').length

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex items-end justify-between">
        <Heading>Dashboard</Heading>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-zinc-800/50 animate-pulse rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatCard title="Total de eventos" value={events.length} />
            <StatCard title="Eventos activos" value={activeEvents.length} />
            <StatCard title="Próximos eventos" value={upcomingEvents.length} />
            <StatCard title="Capacidad total" value={totalCapacity} />
          </>
        )}
      </div>

      {/* Next event spotlight */}
      {!isLoading && nextEvent && (
        <div className="mt-10">
          <Subheading>Próximo evento</Subheading>
          <Link href={`/events/${nextEvent.id}`} className="block mt-3">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.005 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-indigo-500/25 bg-gradient-to-r from-indigo-500/5 to-violet-500/5 p-5 hover:border-indigo-500/40 hover:from-indigo-500/8 hover:to-violet-500/8 transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <BoltIcon className="size-4 text-indigo-400 shrink-0" />
                    <span className="text-xs font-medium text-indigo-400 uppercase tracking-wide">
                      Próximo en {getDaysUntil(nextEvent.event_date_time)} días
                    </span>
                  </div>
                  <p className="text-base font-semibold text-white truncate">{nextEvent.name}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {formatEventDate(nextEvent.event_date_time, nextEvent.timezone)}
                  </p>
                  {nextEvent.address && (
                    <p className="mt-0.5 text-sm text-zinc-600 truncate">{nextEvent.address}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-3xl font-bold text-indigo-400 tabular-nums">
                      {getDaysUntil(nextEvent.event_date_time)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">días</p>
                  </div>
                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/events/${nextEvent.id}/studio`; }}
                      className="flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      <PaintBrushIcon className="size-3" />
                      Studio
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/events/${nextEvent.id}/checkin`; }}
                      className="flex items-center gap-1 rounded-lg border border-lime-500/30 bg-lime-500/10 px-2 py-1.5 text-[11px] font-medium text-lime-400 hover:bg-lime-500/20 transition-colors"
                    >
                      Check-in
                    </button>
                  </div>
                </div>
              </div>

              {/* Guest stats for next event */}
              {nextEventGuests.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <UsersIcon className="size-3.5 text-zinc-600" />
                    {nextEventGuests.length} invitados
                  </span>
                  <span className="flex items-center gap-1.5 text-lime-400">
                    <CheckCircleIcon className="size-3.5" />
                    {nextEventConfirmed} confirmados
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <ClockIcon className="size-3.5" />
                    {nextEventPending} pendientes
                  </span>
                </div>
              )}
            </motion.div>
          </Link>
        </div>
      )}

      {/* Active events table */}
      <div className="mt-14 flex items-center justify-between">
        <Subheading>Eventos activos</Subheading>
        {activeEvents.length > 0 && (
          <Link href="/events" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Ver todos →
          </Link>
        )}
      </div>

      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeader>Evento</TableHeader>
            <TableHeader>Fecha</TableHeader>
            <TableHeader>Tipo</TableHeader>
            <TableHeader>Capacidad</TableHeader>
            <TableHeader>Tiempo</TableHeader>
          </TableRow>
        </TableHead>

        <TableBody>
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <TableRow key={i}>
                {[...Array(5)].map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-zinc-800/50 animate-pulse rounded w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : activeEvents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <CalendarDaysIcon className="size-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">No hay eventos activos registrados.</p>
                  <Link href="/events" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                    Crear un evento
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <AnimatePresence>
              {activeEvents.map((event, i) => {
                const daysUntil = getDaysUntil(event.event_date_time)
                const isPast = daysUntil < 0
                return (
                  <motion.tr
                    key={event.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/events/${event.id}`}
                        className="text-zinc-100 hover:text-indigo-400 transition-colors"
                      >
                        {event.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-500 text-sm">
                      {formatEventDate(event.event_date_time, event.timezone)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {eventTypeLabel(event.event_type?.name) || '—'}
                    </TableCell>
                    <TableCell className="text-zinc-400 tabular-nums">
                      {event.max_guests != null ? event.max_guests : '—'}
                    </TableCell>
                    <TableCell>
                      {daysUntil === 0 ? (
                        <Badge color="amber">¡Hoy!</Badge>
                      ) : isPast ? (
                        <Badge color="zinc">Pasado</Badge>
                      ) : daysUntil <= 7 ? (
                        <Badge color="amber">En {daysUntil}d</Badge>
                      ) : (
                        <Badge color="lime">En {daysUntil}d</Badge>
                      )}
                    </TableCell>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          )}
        </TableBody>
      </Table>
    </PageTransition>
  )
}
