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
import useSWR from 'swr'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'

function formatEventDate(dateString: string, timeZone: string) {
  const date = new Date(dateString)
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || 'UTC',
  })
}

export default function Home() {
  // GET /api/events/cache/all → Redis key "all:events" → ListAllEvents()
  const { data: events = [], isLoading } = useSWR<Event[]>('/events/cache/all', fetcher)

  const activeEvents = events.filter((e) => e.is_active)
  const totalCapacity = events.reduce((sum, e) => sum + (e.max_guests ?? 0), 0)

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex items-end justify-between">
        <Heading>Dashboard</Heading>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatCard
                title="Total eventos"
                value={events?.length || 0}
            />
            <StatCard
                title="Eventos activos"
                value={activeEvents.length}
            />
            <StatCard
                title="Capacidad total de invitados"
                value={totalCapacity}
            />
          </>
        )}
      </div>

      {/* Active events */}
      <Subheading className="mt-14">Eventos activos</Subheading>

      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeader>Evento</TableHeader>
            <TableHeader>Fecha</TableHeader>
            <TableHeader>Tipo</TableHeader>
            <TableHeader>Invitados</TableHeader>
            <TableHeader>Estado</TableHeader>
          </TableRow>
        </TableHead>

        <TableBody>
          {isLoading ? (
              [1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="skeleton h-12 rounded" />
                  </TableRow>
              ))
          ) : activeEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-zinc-500 py-8 text-center">
                  No hay eventos activos registrados.
                </TableCell>
              </TableRow>
          ) : (
              <AnimatePresence>
                {activeEvents.map((event, i) => (
                    <motion.tr
                      key={event.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                    >
                      <TableCell className="font-medium">
                        {event.name}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {formatEventDate(event.event_date_time, event.timezone)}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {event.event_type?.name || 'General'}
                      </TableCell>
                      <TableCell>{event.max_guests ?? '—'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-md bg-lime-500/10 px-2 py-1 text-xs font-medium text-lime-400 ring-1 ring-inset ring-lime-500/20">
                            Activo
                        </span>
                      </TableCell>
                    </motion.tr>
                ))}
              </AnimatePresence>
          )}
        </TableBody>
      </Table>
    </PageTransition>
  )
}
