'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { loadEventFormModal, preloadEventFormIntent } from '@/components/events/preload-event-form'
import { preloadEventWorkspace } from '@/components/events/preload-event-workspace'
import { Link } from '@/components/link'
import { PageHeader } from '@/components/product/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { PageDataError } from '@/components/ui/page-data-error'
import { PageTransition } from '@/components/ui/page-transition'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useDebounce } from '@/hooks/useDebounce'
import { useListViewState } from '@/hooks/useListViewState'
import { accessCan, createAccessProfile } from '@/lib/access-profile'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsPagePath } from '@/lib/api-paths'
import { getCalendarDaysUntil } from '@/lib/date-time'
import { removeEventCacheValue, upsertEventCacheValue } from '@/lib/event-cache'
import { eventCoversMediaRefreshKey, getEventCoversRefreshDelay, resolveEventCoverUrl } from '@/lib/event-media'
import { eventTypeLabel } from '@/lib/event-type-label'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event, EventListPage } from '@/models/Event'
import { useStore } from '@/store/useStore'
import {
  ArrowRightIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlusIcon,
  Square2StackIcon,
} from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload } from 'swr'

// Lazy-loaded modals
const loadEventDuplicateModal = () => import('@/components/events/event-duplicate-modal')
const loadEventDeleteModal = () => import('@/components/events/event-delete-modal')
const loadEventListActionsMenu = () => import('@/components/events/event-list-actions-menu')

const EventFormModal = dynamic(() => loadEventFormModal().then((module) => module.EventFormModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando evento" />,
})
const EventDuplicateModal = dynamic(() => loadEventDuplicateModal().then((module) => module.EventDuplicateModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando duplicado" />,
})
const EventDeleteModal = dynamic(() => loadEventDeleteModal().then((module) => module.EventDeleteModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando confirmación" />,
})
const EventListActionsMenu = dynamic(() => loadEventListActionsMenu().then((module) => module.EventListActionsMenu), {
  ssr: false,
  loading: () => (
    <div className="absolute top-full right-0 z-30 mt-2 h-36 w-52 animate-pulse rounded-xl border border-white/10 bg-zinc-900" />
  ),
})

function preloadEventForm() {
  void preloadEventFormIntent().catch(() => undefined)
}

function preloadEventActions() {
  void loadEventListActionsMenu().catch(() => undefined)
}

function preloadEventDuplicate() {
  void loadEventDuplicateModal().catch(() => undefined)
}

function preloadEventDelete() {
  void loadEventDeleteModal().catch(() => undefined)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string | undefined | null, timeZone?: string | null): number | null {
  return getCalendarDaysUntil(dateString, timeZone)
}

function CountdownBadge({ dateString, timeZone }: { dateString: string; timeZone?: string | null }) {
  const days = getDaysUntil(dateString, timeZone)
  if (days === null) return <Badge color="zinc">Sin fecha</Badge>
  if (days === 0) return <Badge color="amber">Hoy</Badge>
  if (days < 0) return <Badge color="zinc">Hace {Math.abs(days)}d</Badge>
  if (days <= 7) return <Badge color="amber">En {days}d</Badge>
  if (days <= 30) return <Badge color="indigo">En {days}d</Badge>
  return <Badge color="zinc">En {days}d</Badge>
}

type FilterType = 'all' | 'upcoming' | 'past' | 'today'
const EVENT_FILTERS = ['all', 'upcoming', 'today', 'past'] as const satisfies readonly FilterType[]
const EVENTS_PAGE_SIZE = 12
const EMPTY_EVENTS: Event[] = []
const EMPTY_COUNTS: EventListPage['counts'] = { all: 0, upcoming: 0, today: 0, past: 0 }

// ─── Pending moments badge ────────────────────────────────────────────────────

function EventMomentsBadge({ pending }: { pending: number }) {
  if (pending === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-500/20">
      {pending} pendiente{pending !== 1 ? 's' : ''}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const router = useRouter()
  const currentClient = useStore((s) => s.currentClient)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)
  const workspaceMode = useStore((s) => s.workspaceMode)
  const isRoot = Boolean(user?.is_root)
  const accessProfile = useMemo(
    () => createAccessProfile(applicationSession, workspaceMode, currentClient?.id),
    [applicationSession, currentClient?.id, workspaceMode]
  )
  const canCreateEvents = accessCan(accessProfile, 'events:create')
  const canEditEvents = accessCan(accessProfile, 'events:manage')
  const canDeleteEvents = accessCan(accessProfile, 'events:delete')
  const hasEventActions = canEditEvents || canCreateEvents || canDeleteEvents

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false)
  const [eventToDuplicate, setEventToDuplicate] = useState<Event | null>(null)
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null)
  const [openActionEventId, setOpenActionEventId] = useState<string | null>(null)
  const { search, setSearch, filter, setFilter, page, setPage } = useListViewState<FilterType>({
    defaultFilter: 'all',
    filterParam: 'filter',
    pagination: true,
    validFilters: EVENT_FILTERS,
  })

  const debouncedSearch = useDebounce(search, 200)
  const swrKey = scopedEventsPagePath(currentClient?.id, isRoot, {
    page,
    page_size: EVENTS_PAGE_SIZE,
    search: debouncedSearch,
    filter,
  })
  const {
    data: rawEvents,
    isLoading,
    isValidating,
    error,
    mutate: mutateEvents,
  } = useSWR<EventListPage>(swrKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const eventsPage = useMemo(() => readApiData<EventListPage | undefined>(rawEvents), [rawEvents])
  const events = eventsPage?.data ?? EMPTY_EVENTS
  const counts = eventsPage?.counts ?? EMPTY_COUNTS
  const dataErrorState = getDataErrorState(error, rawEvents)
  const lastCoverRefreshKey = useRef<string | null>(null)

  const openNewEventModal = useCallback(() => {
    setSelectedEvent(null)
    setIsFormOpen(true)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('create') !== '1' || !canCreateEvents) return

    preloadEventForm()
    setSelectedEvent(null)
    setIsFormOpen(true)
    params.delete('create')
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [canCreateEvents])

  const openEditEventModal = useCallback((event: Event) => {
    setSelectedEvent(event)
    setIsFormOpen(true)
  }, [])

  const preloadEventDetail = useCallback(
    (event: Event) => {
      router.prefetch(`/events/${event.id}`)
      void preloadEventWorkspace(event).catch(() => undefined)
    },
    [router]
  )

  const preloadEventStudio = useCallback(
    (event: Event) => {
      router.prefetch(`/events/${event.id}/studio`)
      void import('@/components/studio/preload-studio-panel')
        .then((module) => module.preloadStudioWorkspace(event.id))
        .catch(() => undefined)
    },
    [router]
  )

  useEffect(() => {
    if (isLoading || !eventsPage) return
    const lastPage = Math.max(eventsPage.total_pages, 1)
    if (page > lastPage) setPage(lastPage, 'replace')
  }, [eventsPage, isLoading, page, setPage])

  const preloadEventsPage = useCallback(
    (nextPage: number) => {
      const nextPath = scopedEventsPagePath(currentClient?.id, isRoot, {
        page: nextPage,
        page_size: EVENTS_PAGE_SIZE,
        search: debouncedSearch,
        filter,
      })
      if (!nextPath) return
      void Promise.resolve(preload(nextPath, fetcher))
        .then(() => undefined)
        .catch(() => undefined)
    },
    [currentClient?.id, debouncedSearch, filter, isRoot]
  )

  const saveEventInCurrentPage = useCallback(
    async (savedEvent: Event | null) => {
      if (!savedEvent) {
        void mutateEvents()
        return
      }
      const alreadyVisible = events.some((event) => event.id === savedEvent.id)
      const matchesSearch = `${savedEvent.name} ${savedEvent.identifier ?? ''}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      if (!alreadyVisible && (page !== 1 || filter !== 'all' || !matchesSearch)) {
        void mutateEvents()
        return
      }
      await mutateEvents((current) => upsertEventCacheValue(current ?? rawEvents, savedEvent) as EventListPage, {
        revalidate: false,
      })
    },
    [debouncedSearch, events, filter, mutateEvents, page, rawEvents]
  )

  const removeEventFromCurrentPage = useCallback(
    async (event: Event) => {
      await mutateEvents((current) => removeEventCacheValue(current ?? rawEvents, event.id) as EventListPage, {
        revalidate: false,
      })
    },
    [mutateEvents, rawEvents]
  )

  const restoreEventToCurrentPage = useCallback(
    async (event: Event) => {
      await mutateEvents((current) => upsertEventCacheValue(current ?? rawEvents, event) as EventListPage, {
        revalidate: false,
      })
    },
    [mutateEvents, rawEvents]
  )

  const coverRefreshDelay = useMemo(() => getEventCoversRefreshDelay(events), [events])
  const coverRefreshKey = useMemo(() => eventCoversMediaRefreshKey(events), [events])

  useEffect(() => {
    if (coverRefreshDelay === null || !coverRefreshKey) return

    const refreshCovers = () => {
      lastCoverRefreshKey.current = coverRefreshKey
      void mutateEvents()
    }

    if (coverRefreshDelay <= 0) {
      if (lastCoverRefreshKey.current === coverRefreshKey) return
      refreshCovers()
      return
    }

    const timer = window.setTimeout(refreshCovers, coverRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [coverRefreshDelay, coverRefreshKey, mutateEvents])

  if (!swrKey && !isRoot) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <BuildingOfficeIcon className="mb-4 size-12 text-zinc-700" />
          <h2 className="text-lg font-semibold text-zinc-300">Sin organización seleccionada</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Selecciona una organización en el menú superior para ver sus eventos.
          </p>
        </div>
      </PageTransition>
    )
  }

  if (dataErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar los eventos"
        description="La operación permanece intacta. Reintenta para recuperar tu portafolio de eventos."
        onRetry={() => void mutateEvents()}
        retrying={isValidating}
        icon={Square2StackIcon}
      />
    )
  }

  const FILTER_TABS: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'upcoming', label: 'Próximos', count: counts.upcoming },
    { id: 'today', label: 'Hoy', count: counts.today },
    { id: 'past', label: 'Pasados', count: counts.past },
  ]

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Portafolio de eventos"
        title="Eventos"
        description={
          accessProfile.platformLevel === 'root_2'
            ? 'Vista operativa: consulta y opera asistentes, check-in y analítica sin cambiar la estructura del evento.'
            : 'Planea, publica y opera cada experiencia desde un solo lugar.'
        }
        icon={Square2StackIcon}
        actions={
          canCreateEvents ? (
            <Button
              color="indigo"
              onClick={openNewEventModal}
              onPointerEnter={preloadEventForm}
              onPointerDown={preloadEventForm}
              onFocus={preloadEventForm}
            >
              <PlusIcon />
              Crear evento
            </Button>
          ) : undefined
        }
      />

      {dataErrorState === 'stale' && (
        <div className="mt-6">
          <StaleDataNotice label="eventos" onRetry={() => void mutateEvents()} retrying={isValidating} />
        </div>
      )}

      {/* Filters + Search */}
      {!isLoading && (counts.all > 0 || search || filter !== 'all') && (
        <div className="premium-surface mt-8 flex flex-col gap-3 rounded-2xl p-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Date filter tabs */}
          <div className="flex max-w-full self-start overflow-x-auto rounded-xl p-0.5">
            {FILTER_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors',
                  filter === tab.id
                    ? 'bg-white/8 text-white shadow-sm ring-1 ring-white/8'
                    : 'text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200',
                ].join(' ')}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      filter === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-800/80 text-zinc-600',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:max-w-xs">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              aria-label="Buscar evento"
              placeholder="Buscar evento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-transparent bg-black/15 py-2 pr-4 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-4 border-b border-white/6 p-5 last:border-b-0">
              <div className="size-14 shrink-0 rounded-xl bg-zinc-800" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-3/4 max-w-[12rem] rounded bg-zinc-800" />
                <div className="h-3 w-full max-w-[16rem] rounded bg-zinc-800" />
                <div className="h-3 w-1/2 max-w-[8rem] rounded bg-zinc-800" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="h-5 w-16 rounded-full bg-zinc-800" />
                <div className="hidden h-5 w-12 rounded-full bg-zinc-800 sm:block" />
                <div className="size-7 rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/7 bg-white/[0.02]">
          {debouncedSearch || filter !== 'all' ? (
            <div className="py-16 text-center">
              <MagnifyingGlassIcon className="mx-auto mb-3 size-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Sin resultados</p>
              <button
                onClick={() => {
                  setSearch('')
                  setFilter('all')
                }}
                className="mt-3 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <EmptyState
              icon={Square2StackIcon}
              title="Sin eventos"
              description={
                accessProfile.platformLevel === 'root_2'
                  ? 'No hay eventos para operar en este alcance.'
                  : 'Esta organización aún no tiene eventos registrados.'
              }
              action={
                canCreateEvents ? { label: 'Crear primer evento', onClick: openNewEventModal } : undefined
              }
            />
          )}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-white/6 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02] shadow-xl shadow-black/5">
          {events.map((event) => {
            const days = getDaysUntil(event.event_date_time, event.timezone) ?? 0
            const isPast = days < 0
            const coverImageUrl = resolveEventCoverUrl(event, process.env.NEXT_PUBLIC_BACKEND_URL)

            return (
              <li key={event.id}>
                <div
                  onPointerEnter={() => preloadEventDetail(event)}
                  onPointerDown={() => preloadEventDetail(event)}
                  onFocusCapture={() => preloadEventDetail(event)}
                  className={[
                    'group relative flex items-center gap-3 p-4 transition-colors focus-within:ring-2 focus-within:ring-pink-400/60 focus-within:ring-inset sm:gap-4 sm:p-5',
                    isPast ? 'hover:bg-white/[0.02]' : 'hover:bg-white/[0.035]',
                  ].join(' ')}
                >
                  <Link
                    href={`/events/${event.id}`}
                    aria-label={`Abrir evento ${event.name}`}
                    className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none"
                  >
                    <span className="sr-only">Abrir evento {event.name}</span>
                  </Link>

                  {/* Cover thumbnail or placeholder */}
                  <div className="pointer-events-none relative z-10 size-12 shrink-0 sm:size-16">
                    {coverImageUrl ? (
                      <Image
                        src={coverImageUrl}
                        alt={event.name}
                        fill
                        sizes="(max-width: 640px) 48px, 64px"
                        className={['rounded-xl object-cover', isPast ? 'opacity-45 grayscale' : ''].join(' ')}
                      />
                    ) : (
                      <div
                        className={[
                          'flex size-12 items-center justify-center rounded-xl sm:size-16',
                          isPast ? 'bg-zinc-800/50' : 'bg-indigo-500/10',
                        ].join(' ')}
                      >
                        <CalendarDaysIcon
                          className={['size-5 sm:size-6', isPast ? 'text-zinc-700' : 'text-indigo-400'].join(' ')}
                        />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="pointer-events-none relative z-10 min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-x-2">
                      <span
                        className={[
                          'min-w-0 truncate text-sm font-semibold transition-colors group-hover:text-white sm:text-base',
                          isPast ? 'text-zinc-400' : 'text-zinc-100',
                        ].join(' ')}
                      >
                        {event.name}
                      </span>
                      {event.event_type?.name && (
                        <span className="hidden rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 uppercase sm:inline-flex">
                          {eventTypeLabel(event.event_type.name)}
                        </span>
                      )}
                      <EventMomentsBadge pending={event.pending_moment_count ?? 0} />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="flex min-w-0 items-center gap-1 text-xs whitespace-nowrap text-zinc-500">
                        <CalendarDaysIcon className="size-3 shrink-0" />
                        <span className="sm:hidden">
                          {new Date(event.event_date_time).toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            timeZone: event.timezone || 'UTC',
                          })}
                        </span>
                        <span className="hidden sm:inline">
                          {new Date(event.event_date_time).toLocaleString('es-MX', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: event.timezone || 'UTC',
                          })}
                        </span>
                      </span>
                      {event.address && (
                        <span className="hidden max-w-[220px] items-center gap-1 truncate text-xs text-zinc-600 sm:flex">
                          <MapPinIcon className="size-3 shrink-0" />
                          {event.address}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 hidden text-[11px] text-zinc-700 sm:block">
                      {event.max_guests != null
                        ? `Capacidad para ${event.max_guests} invitados`
                        : 'Capacidad sin definir'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="relative z-20 flex shrink-0 items-center gap-2">
                    <CountdownBadge dateString={event.event_date_time} timeZone={event.timezone} />
                    <span className="pointer-events-none hidden min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors group-hover:border-white/15 group-hover:text-white sm:flex">
                      Abrir
                      <ArrowRightIcon className="size-4" />
                    </span>

                    {hasEventActions && (
                      <details
                        name="event-actions"
                        className="group/actions relative"
                        onToggle={(eventDetails) => {
                          setOpenActionEventId(eventDetails.currentTarget.open ? event.id : null)
                        }}
                      >
                        <summary
                          role="button"
                          aria-label={`Más acciones para ${event.name}`}
                          onPointerEnter={preloadEventActions}
                          onPointerDown={preloadEventActions}
                          onFocus={preloadEventActions}
                          className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                        >
                          <EllipsisVerticalIcon className="size-5" />
                        </summary>
                        {openActionEventId === event.id && (
                          <EventListActionsMenu
                            event={event}
                            canEdit={canEditEvents}
                            canDuplicate={canCreateEvents && canEditEvents}
                            canDelete={canDeleteEvents}
                            onEdit={openEditEventModal}
                            onEditIntent={preloadEventForm}
                            onDuplicateIntent={preloadEventDuplicate}
                            onDeleteIntent={preloadEventDelete}
                            onStudioIntent={preloadEventStudio}
                            onDuplicate={(selected) => {
                              setEventToDuplicate(selected)
                              setIsDuplicateOpen(true)
                            }}
                            onDelete={setEventToDelete}
                          />
                        )}
                      </details>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!isLoading && (eventsPage?.total ?? 0) > EVENTS_PAGE_SIZE && (
        <Pagination
          total={eventsPage?.total ?? 0}
          page={page}
          pageSize={EVENTS_PAGE_SIZE}
          onPageChange={setPage}
          onPageIntent={preloadEventsPage}
        />
      )}

      {isFormOpen && (
        <EventFormModal isOpen setIsOpen={setIsFormOpen} event={selectedEvent} onSaved={saveEventInCurrentPage} />
      )}

      {isDuplicateOpen && eventToDuplicate && (
        <EventDuplicateModal
          event={eventToDuplicate}
          isOpen
          setIsOpen={setIsDuplicateOpen}
          onCreated={saveEventInCurrentPage}
        />
      )}

      {eventToDelete && (
        <EventDeleteModal
          event={eventToDelete}
          open
          onClose={() => setEventToDelete(null)}
          onDeleted={() => setOpenActionEventId(null)}
          onOptimisticDelete={removeEventFromCurrentPage}
          onDeleteRollback={restoreEventToCurrentPage}
          onRevalidate={() => void mutateEvents()}
        />
      )}
    </PageTransition>
  )
}
