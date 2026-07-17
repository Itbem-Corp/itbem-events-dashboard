'use client'

import { getCalendarDaysUntil } from '@/lib/date-time'
import { getEventConfigMomentWallState } from '@/lib/event-config-moment-wall'
import { shouldLiveRefreshEvent } from '@/lib/event-live-refresh'
import { eventCoversMediaRefreshKey, getEventCoversRefreshDelay, resolveEventCoverUrl } from '@/lib/event-media'
import { eventTypeLabel } from '@/lib/event-type-label'
import { fetcher } from '@/lib/fetcher'
import type { Event } from '@/models/Event'
import type { EventCapabilities } from '@/models/EventMember'
import { ChevronLeftIcon, PaintBrushIcon } from '@heroicons/react/16/solid'
import {
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate, preload, useSWRConfig } from 'swr'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import {
  initialEventDetailGuestsViewState,
  type EventDetailGuestsViewState,
} from '@/components/events/event-detail-guests-state'
import { EventDetailPanelSkeleton } from '@/components/events/event-detail-panel-skeleton'
import { getAvailableEventDetailTabs } from '@/components/events/event-detail-tab-state'
import { EventDetailTabs, type EventDetailTabId } from '@/components/events/event-detail-tabs'
import { EventErrorBoundary } from '@/components/events/event-error-boundary'
import { EventGuestSummary } from '@/components/events/event-guest-summary'
import { eventDetailGuestPagePath, preloadEventDetailPanel } from '@/components/events/preload-event-detail-panel'
import { loadEventFormModal, preloadEventFormIntent } from '@/components/events/preload-event-form'
import { eventWorkspaceCache } from '@/components/events/preload-event-workspace'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { preloadStudioWorkspace } from '@/components/studio/preload-studio-panel'
import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { PageDataError } from '@/components/ui/page-data-error'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useEventDetailGuestData } from '@/hooks/useEventDetailGuestData'
import { useEventDetailTabNavigation } from '@/hooks/useEventDetailTabNavigation'
import { useEventHealthCheck } from '@/hooks/useEventHealthCheck'
import { checkinWorkspacePath, eventCapabilitiesPath, eventDetailPath, eventGuestSummaryPath } from '@/lib/api-paths'
import { findEventInListCache } from '@/lib/event-cache'
import { sanitizeEvent } from '@/lib/sanitize-event'
import { getDataErrorState } from '@/lib/swr-data-state'

const EventDetailGuestsPanel = dynamic(
  () => import('@/components/events/event-detail-guests-panel').then((module) => module.EventDetailGuestsPanel),
  { ssr: false, loading: () => <EventDetailPanelSkeleton tab="invitados" /> }
)
const loadEventDetailActionsMenu = () => import('@/components/events/event-detail-actions-menu')
const EventDetailActionsMenu = dynamic(
  () => loadEventDetailActionsMenu().then((module) => module.EventDetailActionsMenu),
  {
    ssr: false,
  }
)
const loadEventCoverModal = () => import('@/components/events/event-cover-modal')
const EventCoverModal = dynamic(() => loadEventCoverModal().then((module) => module.EventCoverModal), {
  ssr: false,
})
const SeatingPlanV2 = dynamic(
  () => import('@/components/events/seating/seating-plan-v2').then((module) => module.SeatingPlanV2),
  { ssr: false, loading: () => <EventDetailPanelSkeleton tab="asientos" /> }
)
const RSVPTracker = dynamic(() => import('@/components/events/rsvp-tracker').then((module) => module.RSVPTracker), {
  ssr: false,
  loading: () => <EventDetailPanelSkeleton tab="rsvp" />,
})
const EventDetailSettingsPanel = dynamic(
  () => import('@/components/events/event-detail-settings-panel').then((module) => module.EventDetailSettingsPanel),
  { ssr: false, loading: () => <EventDetailPanelSkeleton tab="configuracion" /> }
)
const EventAnalyticsPanel = dynamic(
  () => import('@/components/events/event-analytics-panel').then((module) => module.EventAnalyticsPanel),
  { ssr: false, loading: () => <EventDetailPanelSkeleton tab="analiticas" /> }
)

// Lazy-loaded modals & heavy components
const EventFormModal = dynamic(() => loadEventFormModal().then((module) => module.EventFormModal), {
  ssr: false,
  loading: () => <IntentModalSkeleton title="Preparando evento" />,
})
const MomentsWall = dynamic(() => import('@/components/events/moments-wall').then((module) => module.MomentsWall), {
  ssr: false,
  loading: () => <EventDetailPanelSkeleton tab="momentos" />,
})
const InvitationTracker = dynamic(
  () => import('@/components/events/invitation-tracker').then((module) => module.InvitationTracker),
  { ssr: false, loading: () => <EventDetailPanelSkeleton tab="invitaciones" /> }
)
const EventMembersModal = dynamic(
  () => import('@/components/events/event-members-modal').then((module) => module.EventMembersModal),
  { ssr: false, loading: () => <IntentModalSkeleton title="Preparando equipo" /> }
)

// ─── Tabs ────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string | undefined | null, timeZone?: string | null): number | null {
  return getCalendarDaysUntil(dateString, timeZone)
}

function formatEventDate(dateString: string | undefined | null, timezone: string) {
  if (!dateString) return 'Sin fecha'
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return 'Fecha inválida'
  return d.toLocaleString('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone || 'UTC',
  })
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

function EventDetailSkeleton() {
  return (
    <div className="mt-4 animate-pulse space-y-6">
      <div className="h-4 w-24 rounded bg-surface-raised" />
      <div className="h-8 w-72 rounded bg-surface-raised" />
      <div className="h-4 w-56 rounded bg-surface-raised" />
      {/* Tab bar */}
      <div className="scrollbar-none mt-8 flex gap-0.5 overflow-x-auto border-b border-white/10 pb-px">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-9 w-16 shrink-0 rounded-t-lg bg-surface-raised/60 sm:w-24" />
        ))}
      </div>
      {/* KPI grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-raised" />
        ))}
      </div>
      {/* Description block */}
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-surface-raised" />
        <div className="h-3 w-full rounded bg-surface-raised" />
        <div className="h-3 w-3/4 rounded bg-surface-raised" />
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { cache: swrCache } = useSWRConfig()
  const cachedListEvent = useMemo(() => findEventInListCache(swrCache, id), [id, swrCache])
  const { activeTab: requestedTab, setActiveTab, replaceActiveTab } = useEventDetailTabNavigation()

  const preloadCheckinWorkspace = useCallback(() => {
    router.prefetch(`/events/${id}/checkin`)
    void preload(checkinWorkspacePath(id), fetcher).catch(() => undefined)
  }, [id, router])
  const preloadStudioRoute = useCallback(() => {
    router.prefetch(`/events/${id}/studio`)
    void preloadStudioWorkspace(id).catch(() => undefined)
  }, [id, router])
  const [guestsViewState, setGuestsViewState] = useState<EventDetailGuestsViewState>(initialEventDetailGuestsViewState)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)

  // Event modals
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Data fetching — protected detail endpoint returns a single event object.
  const {
    data: rawEvent,
    isLoading,
    isValidating,
    error,
    mutate: mutateEvent,
  } = useSWR<Event>(id ? eventDetailPath(id) : null, fetcher, {
    fallbackData: id ? (eventWorkspaceCache.peek(id) ?? cachedListEvent) : undefined,
    revalidateOnMount: id ? !eventWorkspaceCache.hasAuthoritative(id) : true,
  })
  const event = useMemo(() => (rawEvent ? sanitizeEvent(rawEvent) : undefined), [rawEvent])
  const {
    data: eventCapabilities,
    error: eventCapabilitiesError,
    isLoading: eventCapabilitiesLoading,
    isValidating: eventCapabilitiesValidating,
    mutate: retryEventCapabilities,
  } = useSWR<EventCapabilities>(id ? eventCapabilitiesPath(id) : null, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const eventErrorState = getDataErrorState(error, rawEvent)
  const availableTabs = useMemo(() => getAvailableEventDetailTabs(eventCapabilities), [eventCapabilities])
  const activeTab: EventDetailTabId = availableTabs.includes(requestedTab) ? requestedTab : 'resumen'
  const lastCoverRefreshKey = useRef<string | null>(null)
  const handlePublicPageContentChanged = useCallback(() => {
    void mutateEvent()
  }, [mutateEvent])

  const handleEventRecovery = useCallback(() => {
    router.refresh()
  }, [router])

  const handleGuestCollectionChanged = useCallback(() => {
    if (event?.id) void mutate(eventGuestSummaryPath(event.id))
  }, [event?.id])

  useEffect(() => {
    if (
      !event ||
      event.guest_summary === undefined ||
      event.guest_share_summary === undefined ||
      !Array.isArray(event.event_sections)
    ) {
      return
    }
    eventWorkspaceCache.rememberAuthoritative(event)
  }, [event])

  // Self-healing: detect and repair data issues transparently
  useEventHealthCheck(rawEvent)

  // The protected detail response embeds config, avoiding a tab-change waterfall.
  const eventConfig = event?.event_config ?? event?.config ?? undefined
  const momentWallConfigState = useMemo(() => getEventConfigMomentWallState(eventConfig), [eventConfig])
  const liveRefreshEnabled = shouldLiveRefreshEvent(Boolean(event?.is_active), event?.event_date_time, event?.timezone)
  const coverImageUrl = resolveEventCoverUrl(event, process.env.NEXT_PUBLIC_BACKEND_URL)
  const coverRefreshDelay = useMemo(() => getEventCoversRefreshDelay(event ? [event] : []), [event])
  const coverRefreshKey = useMemo(() => eventCoversMediaRefreshKey(event ? [event] : []), [event])

  useEffect(() => {
    if (coverRefreshDelay === null || !coverRefreshKey) return

    const refreshCover = () => {
      lastCoverRefreshKey.current = coverRefreshKey
      void mutateEvent()
    }

    if (coverRefreshDelay <= 0) {
      if (lastCoverRefreshKey.current === coverRefreshKey) return
      refreshCover()
      return
    }

    const timer = window.setTimeout(refreshCover, coverRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [coverRefreshDelay, coverRefreshKey, mutateEvent])

  useEffect(() => {
    if (!eventCapabilities && !eventCapabilitiesError) return
    if (!availableTabs.includes(requestedTab)) replaceActiveTab('resumen')
  }, [availableTabs, eventCapabilities, eventCapabilitiesError, replaceActiveTab, requestedTab])

  const {
    summary: guestSummary,
    summaryError: guestSummaryError,
    summaryLoading: guestSummaryLoading,
    retrySummary: retryGuestSummary,
  } = useEventDetailGuestData(id, activeTab, liveRefreshEnabled, rawEvent ? (event?.guest_summary ?? null) : undefined)

  const handleTabIntent = useCallback(
    (tab: EventDetailTabId) => {
      const guestDataCached = Boolean(id && swrCache.get(eventDetailGuestPagePath(id))?.data !== undefined)
      void preloadEventDetailPanel(tab, id, { guestDataCached }).catch(() => undefined)
    },
    [id, swrCache]
  )

  // ── Loading / Error states ──────────────────────────────────────────────────

  if (isLoading && !event) return <EventDetailSkeleton />

  if (!event) {
    return (
      <PageDataError
        title="No pudimos cargar este evento"
        description="Verifica que el evento siga disponible o reintenta para recuperar su centro de operación."
        onRetry={() => void mutateEvent()}
        retrying={isValidating}
      />
    )
  }

  const daysUntil = getDaysUntil(event.event_date_time, event.timezone)
  const isPast = daysUntil !== null && daysUntil < 0
  const accessSummary = eventCapabilitiesLoading
    ? 'Verificando tu alcance…'
    : eventCapabilitiesError
      ? 'No pudimos verificar tus permisos'
      : eventCapabilities?.['members:manage']
        ? 'Administras el equipo y la operación de este evento'
        : eventCapabilities?.['event:manage']
          ? 'Puedes editar este evento y su contenido'
          : eventCapabilities?.['checkin:run']
            ? 'Puedes operar check-in y RSVP'
            : eventCapabilities?.['analytics:view']
              ? 'Puedes consultar métricas y resultados'
              : 'Acceso de consulta'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <EventErrorBoundary eventId={id} onRetry={handleEventRecovery}>
      <PageTransition>
        {eventErrorState === 'stale' && (
          <div className="mb-5">
            <StaleDataNotice label="datos del evento" onRetry={() => void mutateEvent()} retrying={isValidating} />
          </div>
        )}

        {/* Banner header with cover image */}
        <div className="app-shell-panel relative overflow-hidden rounded-2xl border sm:rounded-3xl">
          {/* Cover image background */}
          {coverImageUrl && <Image src={coverImageUrl} alt="" fill priority sizes="100vw" className="object-cover" />}

          {/* Gradient overlay */}
          <div
            className={
              coverImageUrl
                ? 'absolute inset-0 bg-gradient-to-r from-canvas/98 via-canvas/88 to-canvas/65'
                : 'absolute inset-0 bg-gradient-to-br from-[var(--app-surface-raised)] via-[var(--app-surface)] to-[var(--app-surface-soft)]'
            }
          />

          {/* Content */}
          <div className="relative px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            {/* Breadcrumb */}
            <div className="mb-3">
              <Link
                href="/events"
                aria-label="Volver a eventos"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-soft px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-(--tenant-accent)/25 hover:bg-surface-raised hover:text-ink sm:border-transparent sm:bg-transparent sm:px-0 sm:text-sm"
              >
                <ChevronLeftIcon className="size-4 fill-ink-secondary" />
                <span className="hidden sm:inline">Eventos</span>
              </Link>
            </div>

            {/* Title + Badge */}
            <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-indigo-400 uppercase">
              Centro de operación
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Heading className="text-2xl/8 tracking-tight sm:text-3xl/9 lg:text-4xl/10">{event.name}</Heading>
              <Badge color={event.is_active ? 'lime' : 'zinc'}>{event.is_active ? 'Activo' : 'Inactivo'}</Badge>
              {(() => {
                const typeLabel = eventTypeLabel(event.event_type?.name)
                return typeLabel ? (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
                    {typeLabel}
                  </span>
                ) : null
              })()}
            </div>

            {/* Meta line */}
            <p className="mt-2 max-w-3xl text-sm/6 break-words text-ink-secondary">
              {formatEventDate(event.event_date_time, event.timezone)}
              {event.address && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">
                    {' '}
                    ·{' '}
                  </span>
                  <br className="sm:hidden" />
                  {event.address}
                </>
              )}
              <span aria-hidden="true"> · </span>
              {daysUntil === null ? (
                <span className="text-ink-muted">Sin fecha</span>
              ) : daysUntil === 0 ? (
                <span className="font-medium text-amber-400">¡Hoy!</span>
              ) : isPast ? (
                <span className="text-ink-muted">Hace {Math.abs(daysUntil)} días</span>
              ) : daysUntil <= 7 ? (
                <span className="font-medium text-amber-400">
                  En {daysUntil} día{daysUntil !== 1 ? 's' : ''}
                </span>
              ) : (
                <span>En {daysUntil} días</span>
              )}
            </p>
            <div
              role={eventCapabilitiesError ? 'alert' : 'status'}
              aria-live="polite"
              className={`mt-3 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                eventCapabilitiesError
                  ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
                  : eventCapabilitiesLoading
                    ? 'border-white/10 bg-white/5 text-ink-secondary'
                    : 'border-indigo-500/20 bg-indigo-500/8 text-indigo-700 dark:text-indigo-200'
              }`}
            >
              {eventCapabilitiesLoading ? (
                <ArrowPathIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                />
              ) : eventCapabilitiesError ? (
                <ExclamationTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />
              )}
              <span>Tu alcance: {accessSummary}</span>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
              {eventCapabilities?.['event:manage'] && (
                <Button
                  href={`/events/${id}/studio`}
                  color="indigo"
                  onPointerEnter={preloadStudioRoute}
                  onPointerDown={preloadStudioRoute}
                  onFocus={preloadStudioRoute}
                >
                  <PaintBrushIcon />
                  Studio
                </Button>
              )}
              {eventCapabilities?.['checkin:run'] && (
                <Button
                  href={`/events/${id}/checkin`}
                  outline
                  onFocus={preloadCheckinWorkspace}
                  onPointerDown={preloadCheckinWorkspace}
                  onPointerEnter={preloadCheckinWorkspace}
                >
                  <ClipboardDocumentCheckIcon />
                  Check-in
                </Button>
              )}
              {eventCapabilities?.['members:manage'] && event.client_id && (
                <Button outline onClick={() => setMembersOpen(true)}>
                  <UsersIcon />
                  Equipo
                </Button>
              )}

              {eventCapabilities?.['event:manage'] && (
                <details
                  className="group/actions relative"
                  onToggle={(event) => setActionsOpen(event.currentTarget.open)}
                >
                  <summary
                    role="button"
                    aria-label="Más acciones"
                    onPointerEnter={() => void loadEventDetailActionsMenu().catch(() => undefined)}
                    onPointerDown={() => void loadEventDetailActionsMenu().catch(() => undefined)}
                    onFocus={() => void loadEventDetailActionsMenu().catch(() => undefined)}
                    className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-soft px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-(--tenant-accent)/25 hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                  >
                    <EllipsisHorizontalIcon aria-hidden="true" className="size-4 text-ink-secondary" />
                    Más acciones
                  </summary>
                  {actionsOpen && (
                    <EventDetailActionsMenu
                      event={event}
                      onEdit={() => setIsEditOpen(true)}
                      onEditIntent={() => void preloadEventFormIntent().catch(() => undefined)}
                      onPublicContentChanged={handlePublicPageContentChanged}
                    />
                  )}
                </details>
              )}
            </div>
          </div>
        </div>

        {event.client_id && (
          <EventMembersModal
            eventId={id}
            clientId={event.client_id}
            isOpen={membersOpen}
            onClose={() => setMembersOpen(false)}
          />
        )}

        {eventCapabilitiesError && (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                <ExclamationTriangleIcon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-100">No pudimos cargar tus permisos</p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  Por seguridad, solo mostramos el resumen hasta verificar tu alcance en este evento.
                </p>
              </div>
            </div>
            <Button
              outline
              className="w-full shrink-0 sm:w-auto"
              onClick={() => void retryEventCapabilities()}
              disabled={eventCapabilitiesValidating}
            >
              <ArrowPathIcon
                aria-hidden="true"
                className={eventCapabilitiesValidating ? 'animate-spin motion-reduce:animate-none' : undefined}
              />
              {eventCapabilitiesValidating ? 'Reintentando…' : 'Reintentar permisos'}
            </Button>
          </div>
        )}

        <div className="mt-6">
          <p className="mb-2 px-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
            Espacios de trabajo
          </p>
          <EventDetailTabs
            activeTab={activeTab}
            availableTabs={availableTabs}
            guestCount={guestSummary?.total ?? 0}
            pendingInvitationCount={guestSummary?.pending ?? 0}
            onTabChange={setActiveTab}
            onTabIntent={handleTabIntent}
          />
        </div>

        {/* Tab content */}
        <div
          key={activeTab}
          id={`event-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`event-tab-${activeTab}`}
          className="mt-6"
        >
          {/* ── RESUMEN ─────────────────────────────────────────────────────── */}
          {activeTab === 'resumen' && (
            <div className="space-y-10">
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {[
                  {
                    label: 'Máx. invitados',
                    value: event.max_guests != null ? String(event.max_guests) : 'Sin límite',
                  },
                  {
                    label: 'Confirmados',
                    value: guestSummaryLoading
                      ? '—'
                      : guestSummary
                        ? `${guestSummary.confirmed} (${guestSummary.total_attendees} tot.)`
                        : 'No disponible',
                  },
                  {
                    label: 'Tipo de evento',
                    value: eventTypeLabel(event.event_type?.name) || '—',
                  },
                  {
                    label: isPast ? 'Días desde el evento' : 'Días para el evento',
                    value: daysUntil === null ? '—' : daysUntil === 0 ? '¡Hoy!' : String(Math.abs(daysUntil)),
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="min-w-0 rounded-2xl border border-white/7 bg-white/[0.025] p-4 transition-colors hover:border-white/12 hover:bg-white/[0.04] sm:p-5"
                  >
                    <p className="text-[11px] leading-4 font-medium text-ink-muted sm:text-xs">{stat.label}</p>
                    <p className="mt-3 text-lg font-semibold tracking-tight break-words text-white tabular-nums sm:mt-5 sm:text-2xl">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Description */}
              {event.description && (
                <div>
                  <Subheading>Descripción</Subheading>
                  <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{event.description}</p>
                </div>
              )}

              {/* Organizer */}
              {(event.organizer_name || event.organizer_email || event.organizer_phone) && (
                <div>
                  <Subheading>Organizador</Subheading>
                  <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-surface/50 p-5">
                    {event.organizer_name && (
                      <p className="text-sm font-medium text-ink">{event.organizer_name}</p>
                    )}
                    {event.organizer_email && (
                      <p className="text-sm text-ink-secondary">
                        <a href={`mailto:${event.organizer_email}`} className="transition-colors hover:text-ink">
                          {event.organizer_email}
                        </a>
                      </p>
                    )}
                    {event.organizer_phone && <p className="text-sm text-ink-muted">{event.organizer_phone}</p>}
                  </div>
                </div>
              )}

              <EventGuestSummary
                summary={guestSummary}
                isLoading={guestSummaryLoading}
                error={guestSummaryError}
                onRetry={() => void retryGuestSummary()}
                onOpenGuests={eventCapabilities?.['guest:manage'] ? () => setActiveTab('invitados') : undefined}
              />

              {/* Cover image */}
              <div>
                <Subheading>Imagen de portada</Subheading>
                <p className="mt-1 mb-3 text-sm text-ink-muted">
                  La imagen aparece como fondo en el encabezado del evento.
                </p>
                <div className="overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02] sm:flex sm:items-center">
                  <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-canvas sm:w-56">
                    {coverImageUrl ? (
                      <Image
                        src={coverImageUrl}
                        alt="Portada actual del evento"
                        fill
                        sizes="(max-width: 640px) 100vw, 224px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-surface to-indigo-950/50 text-ink-muted">
                        <PhotoIcon className="size-9" />
                        <span className="mt-2 text-xs font-medium">Sin portada</span>
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col items-start p-4 sm:p-5">
                    <p className="text-sm font-medium text-ink">
                      {coverImageUrl ? 'Portada configurada' : 'Añade una identidad visual al evento'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      Formato recomendado: 1920 × 1080 px, relación 16:9.
                    </p>
                    {eventCapabilities?.['event:manage'] && (
                      <Button
                        outline
                        className="mt-4 w-full sm:w-auto"
                        onClick={() => setCoverEditorOpen(true)}
                        onPointerEnter={() => void loadEventCoverModal().catch(() => undefined)}
                        onPointerDown={() => void loadEventCoverModal().catch(() => undefined)}
                        onFocus={() => void loadEventCoverModal().catch(() => undefined)}
                      >
                        <PhotoIcon />
                        {coverImageUrl ? 'Administrar portada' : 'Agregar portada'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── INVITADOS ───────────────────────────────────────────────────── */}
          {activeTab === 'invitados' && eventCapabilities?.['guest:manage'] && (
            <EventDetailGuestsPanel
              event={event}
              summary={guestSummary}
              viewState={guestsViewState}
              onViewStateChange={setGuestsViewState}
              onPublicContentChanged={handleGuestCollectionChanged}
            />
          )}

          {activeTab === 'invitaciones' && eventCapabilities?.['guest:manage'] && (
            <InvitationTracker event={event} summary={guestSummary} />
          )}

          {/* ── ASIENTOS (MESAS) ────────────────────────────────────────────── */}
          {activeTab === 'asientos' && eventCapabilities?.['guest:manage'] && (
            <SeatingPlanV2 eventId={event.id} eventIdentifier={event.identifier} />
          )}

          {/* ── RSVP ────────────────────────────────────────────────────────── */}
          {activeTab === 'rsvp' && eventCapabilities?.['guest:manage'] && (
            <RSVPTracker eventId={event.id} eventIdentifier={event.identifier} summary={guestSummary} />
          )}

          {/* ── MOMENTOS ────────────────────────────────────────────────────── */}
          {activeTab === 'momentos' && (
            <MomentsWall
              eventId={event.id}
              canManage={Boolean(eventCapabilities?.['event:manage'])}
              eventIdentifier={event.identifier}
              eventName={event.name}
              momentsWallPublished={momentWallConfigState.wallPublished}
              shareUploadsEnabled={momentWallConfigState.sharedUploadsConfigured}
              allowUploadsEnabled={momentWallConfigState.uploadsEnabled}
              autoApproveUploads={eventConfig?.auto_approve_uploads}
              liveRefreshEnabled={liveRefreshEnabled}
              onPublicContentChanged={handlePublicPageContentChanged}
            />
          )}

          {/* ── ANALÍTICAS ──────────────────────────────────────────────────── */}
          {activeTab === 'analiticas' && eventCapabilities?.['analytics:view'] && (
            <EventAnalyticsPanel
              eventId={event.id}
              eventIdentifier={event.identifier}
              eventCapacity={event.max_guests}
              liveRefreshEnabled={liveRefreshEnabled}
            />
          )}

          {activeTab === 'configuracion' && eventCapabilities?.['event:manage'] && (
            <EventDetailSettingsPanel event={event} onPublicContentChanged={handlePublicPageContentChanged} />
          )}
        </div>

        {isEditOpen && (
          <EventFormModal
            isOpen={isEditOpen}
            setIsOpen={setIsEditOpen}
            event={event}
            onSaved={handlePublicPageContentChanged}
          />
        )}

        {coverEditorOpen && (
          <EventCoverModal
            event={event}
            onClose={() => setCoverEditorOpen(false)}
            onChanged={handlePublicPageContentChanged}
          />
        )}
      </PageTransition>
    </EventErrorBoundary>
  )
}
