'use client'

import { useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { Event } from '@/models/Event'
import { useDebounce } from '@/hooks/useDebounce'
import { useStore } from '@/store/useStore'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageTransition } from '@/components/ui/page-transition'
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Square2StackIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
  DocumentDuplicateIcon,
  PaintBrushIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/20/solid'
import { EventActiveToggle } from '@/components/events/event-active-toggle'
import { motion } from 'motion/react'

// Lazy-loaded modals
const EventFormModal = dynamic(
  () => import('@/components/events/forms/event-form-modal').then((m) => m.EventFormModal),
  { ssr: false }
)
const EventDuplicateModal = dynamic(
  () => import('@/components/events/event-duplicate-modal').then((m) => m.EventDuplicateModal),
  { ssr: false }
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string): number {
  return Math.ceil(
    (new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
}

function CountdownBadge({ dateString }: { dateString: string }) {
  const days = getDaysUntil(dateString)
  if (days === 0) return <Badge color="amber">Hoy</Badge>
  if (days < 0) return <Badge color="zinc">Hace {Math.abs(days)}d</Badge>
  if (days <= 7) return <Badge color="amber">En {days}d</Badge>
  if (days <= 30) return <Badge color="indigo">En {days}d</Badge>
  return <Badge color="zinc">En {days}d</Badge>
}

type FilterType = 'all' | 'upcoming' | 'past' | 'today'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const currentClient = useStore((s) => s.currentClient)
  const user = useStore((s) => s.user)
  const isRoot = Boolean(user?.is_root)

  const swrKey = currentClient
    ? `/events?client_id=${currentClient.id}`
    : isRoot
    ? '/events'
    : null

  const { data: events = [], isLoading, error } = useSWR<Event[]>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false)
  const [eventToDuplicate, setEventToDuplicate] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const debouncedSearch = useDebounce(search, 200)

  const openNewEventModal = useCallback(() => {
    setSelectedEvent(null)
    setIsFormOpen(true)
  }, [])

  const openEditEventModal = useCallback((event: Event) => {
    setSelectedEvent(event)
    setIsFormOpen(true)
  }, [])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Text search
      const matchesSearch =
        debouncedSearch === '' ||
        event.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (event.address ?? '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (event.organizer_name ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())

      // Date filter
      const days = getDaysUntil(event.event_date_time)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'upcoming' && days > 0) ||
        (filter === 'past' && days < 0) ||
        (filter === 'today' && days === 0)

      return matchesSearch && matchesFilter
    })
  }, [events, debouncedSearch, filter])

  const upcomingCount = useMemo(
    () => events.filter((e) => getDaysUntil(e.event_date_time) > 0).length,
    [events]
  )
  const pastCount = useMemo(
    () => events.filter((e) => getDaysUntil(e.event_date_time) < 0).length,
    [events]
  )
  const todayCount = useMemo(
    () => events.filter((e) => getDaysUntil(e.event_date_time) === 0).length,
    [events]
  )

  if (!swrKey && !isRoot) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <BuildingOfficeIcon className="size-12 text-zinc-700 mb-4" />
          <h2 className="text-lg font-semibold text-zinc-300">Sin organización seleccionada</h2>
          <p className="mt-2 text-sm text-zinc-500 max-w-sm">
            Selecciona una organización en el menú superior para ver sus eventos.
          </p>
        </div>
      </PageTransition>
    )
  }

  if (error) {
    return (
      <div className="py-24 text-center text-sm text-red-400">
        Error al cargar eventos. Intenta de nuevo.
      </div>
    )
  }

  const FILTER_TABS: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: events.length },
    { id: 'upcoming', label: 'Próximos', count: upcomingCount },
    { id: 'today', label: 'Hoy', count: todayCount },
    { id: 'past', label: 'Pasados', count: pastCount },
  ]

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-sm:w-full sm:flex-1">
          <Heading>Eventos</Heading>
          {!isLoading && events.length > 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              {events.length} evento{events.length !== 1 ? 's' : ''} registrado{events.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button onClick={openNewEventModal}>
          Crear evento
        </Button>
      </div>

      {/* Filters + Search */}
      {!isLoading && events.length > 0 && (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Date filter tabs */}
          <div className="flex rounded-xl overflow-x-auto border border-white/10 self-start">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={[
                  'shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-colors',
                  filter === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                ].join(' ')}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      filter === tab.id ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-500',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-xs w-full sm:w-auto">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <input
              type="search"
              placeholder="Buscar evento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-900/50 pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="mt-8 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5 animate-pulse"
            >
              <div className="size-14 rounded-xl bg-zinc-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-zinc-800 rounded" />
                <div className="h-3 w-64 bg-zinc-800 rounded" />
                <div className="h-3 w-32 bg-zinc-800 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 bg-zinc-800 rounded-full" />
                <div className="h-5 w-12 bg-zinc-800 rounded-full" />
                <div className="size-7 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="mt-10">
          {debouncedSearch || filter !== 'all' ? (
            <div className="py-16 text-center">
              <MagnifyingGlassIcon className="mx-auto size-8 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">Sin resultados</p>
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <EmptyState
              icon={Square2StackIcon}
              title="Sin eventos"
              description="Esta organización aún no tiene eventos registrados."
              action={{ label: 'Crear primer evento', onClick: openNewEventModal }}
            />
          )}
        </div>
      ) : (
        <AnimatedList className="mt-6">
          <ul className="space-y-3">
            {filteredEvents.map((event) => {
              const days = getDaysUntil(event.event_date_time)
              const isPast = days < 0

              return (
                <AnimatedListItem key={event.id}>
                  <li>
                    <motion.div
                      whileHover={{ y: -1 }}
                      transition={{ duration: 0.15 }}
                      className={[
                        'flex items-center gap-4 rounded-2xl border bg-zinc-900/50 p-4 transition-colors',
                        isPast ? 'border-white/5' : 'border-white/10 hover:border-white/20',
                      ].join(' ')}
                    >
                      {/* Cover thumbnail or placeholder */}
                      <div className="relative size-14 shrink-0">
                        {event.cover_image_url ? (
                          <img
                            src={event.cover_image_url}
                            alt={event.name}
                            className={[
                              'size-14 rounded-xl object-cover',
                              isPast ? 'opacity-40 grayscale' : '',
                            ].join(' ')}
                          />
                        ) : (
                          <div
                            className={[
                              'size-14 rounded-xl flex items-center justify-center',
                              isPast ? 'bg-zinc-800/50' : 'bg-indigo-500/10',
                            ].join(' ')}
                          >
                            <CalendarDaysIcon
                              className={[
                                'size-6',
                                isPast ? 'text-zinc-700' : 'text-indigo-400',
                              ].join(' ')}
                            />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/events/${event.id}`}
                            className={[
                              'text-sm font-semibold truncate hover:text-white transition-colors',
                              isPast ? 'text-zinc-500' : 'text-zinc-100',
                            ].join(' ')}
                          >
                            {event.name}
                          </Link>
                          {event.event_type?.name && (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
                              {event.event_type.name}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <CalendarDaysIcon className="size-3 shrink-0" />
                            {new Date(event.event_date_time).toLocaleString('es-MX', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                          {event.address && (
                            <span className="flex items-center gap-1 text-xs text-zinc-600 truncate max-w-[140px] sm:max-w-[220px]">
                              <MapPinIcon className="size-3 shrink-0" />
                              {event.address}
                            </span>
                          )}
                        </div>

                        {event.max_guests != null && (
                          <p className="mt-0.5 text-[11px] text-zinc-700">
                            Máx. {event.max_guests} invitados
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <CountdownBadge dateString={event.event_date_time} />
                        <div title={event.is_active ? 'Desactivar evento' : 'Activar evento'}>
                          <EventActiveToggle event={event} />
                        </div>
                        <Button
                          plain
                          onClick={() => {
                            setEventToDuplicate(event)
                            setIsDuplicateOpen(true)
                          }}
                          aria-label={`Duplicar ${event.name}`}
                          title="Duplicar evento"
                        >
                          <DocumentDuplicateIcon className="size-4 text-zinc-400" />
                        </Button>
                        <a
                          href={`/events/${event.id}/studio`}
                          title="Abrir Studio"
                          aria-label={`Studio de ${event.name}`}
                          className="flex items-center rounded p-1 text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                        >
                          <PaintBrushIcon className="size-4" />
                        </a>
                        <Button
                          plain
                          onClick={() => openEditEventModal(event)}
                          aria-label={`Editar ${event.name}`}
                        >
                          <PencilIcon className="size-4 text-zinc-400" />
                        </Button>
                        <Link href={`/events/${event.id}`}>
                          <Button plain aria-label={`Ver ${event.name}`}>
                            <ArrowRightIcon className="size-4 text-zinc-400" />
                          </Button>
                        </Link>
                      </div>
                    </motion.div>
                  </li>
                </AnimatedListItem>
              )
            })}
          </ul>
        </AnimatedList>
      )}

      <EventFormModal
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        event={selectedEvent}
      />

      <EventDuplicateModal
        event={eventToDuplicate}
        isOpen={isDuplicateOpen}
        setIsOpen={setIsDuplicateOpen}
      />
    </PageTransition>
  )
}
