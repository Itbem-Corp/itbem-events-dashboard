'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { preloadEventWorkspace } from '@/components/events/preload-event-workspace'
import { Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsDashboardPath } from '@/lib/api-paths'
import { getCalendarDaysUntil } from '@/lib/date-time'
import { eventTypeLabel } from '@/lib/event-type-label'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { sessionCan } from '@/lib/session-capabilities'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event, EventDashboardOverview } from '@/models/Event'
import { useStore } from '@/store/useStore'
import {
  ArrowRightIcon,
  BoltIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaintBrushIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { motion, useReducedMotion } from 'motion/react'
import { useRouter } from 'next/navigation'
import type { ComponentType, SVGProps } from 'react'
import { useCallback, useMemo } from 'react'
import useSWR from 'swr'

type Icon = ComponentType<SVGProps<SVGSVGElement>>
const EMPTY_EVENTS: Event[] = []
const EMPTY_METRICS: EventDashboardOverview['metrics'] = {
  total: 0,
  active: 0,
  upcoming: 0,
  past_active: 0,
  total_capacity: 0,
}

function getDaysUntil(dateString: string, timeZone?: string | null): number | null {
  return getCalendarDaysUntil(dateString, timeZone)
}

function formatEventDate(dateString: string, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(dateString).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || 'UTC',
    ...options,
  })
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  delay,
  reducedMotion,
}: {
  icon: Icon
  label: string
  value: number
  detail: string
  delay: number
  reducedMotion: boolean | null
}) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reducedMotion ? undefined : { y: -3, transition: { duration: 0.18 } }}
      className="group rounded-2xl border border-white/7 bg-white/[0.025] p-4 transition-colors hover:border-white/12 hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 transition-colors group-hover:text-zinc-300">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-white tabular-nums">
        {value.toLocaleString('es-MX')}
      </p>
      <p className="mt-1 text-xs text-zinc-600">{detail}</p>
    </motion.div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-12">
      <div className="h-64 animate-pulse rounded-3xl bg-zinc-900 lg:col-span-8" />
      <div className="grid grid-cols-2 gap-4 lg:col-span-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-30 animate-pulse rounded-2xl bg-zinc-900" />
        ))}
      </div>
    </div>
  )
}

function ControlPlaneHome() {
  const session = useStore((state) => state.applicationSession)
  const organizationCount = session?.organizations.length ?? 0
  const canViewPlatformUsers = sessionCan(session, 'platform:users:view')
  const canManageTeam = sessionCan(session, 'members:manage')
  const peopleHref = canViewPlatformUsers ? '/users' : '/team'
  const peopleTitle = canViewPlatformUsers ? 'Identidad y permisos' : 'Equipo y accesos'
  const peopleDescription = canViewPlatformUsers
    ? 'Usuarios, roles y acceso por aplicación.'
    : 'Miembros, roles y acceso por producto.'

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Control plane"
        title="Operación de plataforma"
        description="Administra organizaciones, accesos y usuarios desde un espacio separado de la operación de eventos."
        icon={ShieldCheckIcon}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Link
          href="/clients"
          className="premium-surface premium-surface-interactive group relative overflow-hidden rounded-3xl p-6"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-(--tenant-accent) to-transparent opacity-60" />
          <span className="flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.05] text-(--tenant-accent)">
            <BuildingOfficeIcon className="size-5" />
          </span>
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold text-white tabular-nums">{organizationCount}</p>
              <p className="mt-1 text-sm font-medium text-zinc-300">Organizaciones con acceso directo</p>
              <p className="mt-1 text-xs text-zinc-600">Gestiona estructura, clientes y configuración.</p>
            </div>
            <ArrowRightIcon className="size-5 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-(--tenant-accent)" />
          </div>
        </Link>

        {(canViewPlatformUsers || canManageTeam) && (
          <Link href={peopleHref} className="premium-surface premium-surface-interactive group rounded-3xl p-6">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.05] text-zinc-300">
              <UsersIcon className="size-5" />
            </span>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">{peopleTitle}</p>
                <p className="mt-1 text-sm text-zinc-500">{peopleDescription}</p>
              </div>
              <ArrowRightIcon className="size-5 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-white" />
            </div>
          </Link>
        )}
      </div>
    </PageTransition>
  )
}

export default function Home() {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const currentClient = useStore((state) => state.currentClient)
  const user = useStore((state) => state.user)
  const applicationSession = useStore((state) => state.applicationSession)
  const isRoot = Boolean(user?.is_root)
  const hasEvents = applicationSession ? sessionCan(applicationSession, 'events:view') : true
  const eventsKey = hasEvents ? scopedEventsDashboardPath(currentClient?.id, isRoot) : null
  const {
    data: rawEvents,
    isLoading: eventsLoading,
    isValidating: eventsValidating,
    error: eventsError,
    mutate: mutateEvents,
  } = useSWR<EventDashboardOverview>(eventsKey, fetcher, responsiveListSwrOptions)
  const isLoading = Boolean(!eventsKey || eventsLoading)
  const overview = useMemo(() => readApiData<EventDashboardOverview | undefined>(rawEvents), [rawEvents])
  const eventsErrorState = getDataErrorState(eventsError, rawEvents)

  const activeEvents = overview?.active_events ?? EMPTY_EVENTS
  const nextEvent = overview?.next_event ?? undefined
  const metrics = overview?.metrics ?? EMPTY_METRICS

  const nextGuestSummary = overview?.next_event_guest_summary

  const preloadEventDetail = useCallback(
    (event: Event) => {
      router.prefetch(`/events/${event.id}`)
      void preloadEventWorkspace(event).catch(() => undefined)
    },
    [router]
  )

  const preloadEventStudio = useCallback(
    (eventId: string) => {
      router.prefetch(`/events/${eventId}/studio`)
      void import('@/components/studio/preload-studio-panel')
        .then((module) => module.preloadStudioWorkspace(eventId))
        .catch(() => undefined)
    },
    [router]
  )

  const preloadEventCreation = useCallback(() => {
    router.prefetch('/events?create=1')
    void import('@/components/events/forms/event-form-modal').catch(() => undefined)
  }, [router])

  if (applicationSession && !hasEvents) return <ControlPlaneHome />

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Centro de operaciones"
        title="Dashboard"
        description="Lo importante de tus eventos, priorizado para que sepas qué sigue."
        icon={SparklesIcon}
        actions={
          <Button
            href="/events?create=1"
            color="indigo"
            onFocus={preloadEventCreation}
            onPointerDown={preloadEventCreation}
            onPointerEnter={preloadEventCreation}
          >
            <PlusIcon />
            Crear evento
          </Button>
        }
      />

      {eventsErrorState === 'stale' && (
        <div className="mt-6">
          <StaleDataNotice label="eventos" onRetry={() => void mutateEvents()} retrying={eventsValidating} />
        </div>
      )}

      {eventsErrorState === 'fatal' ? (
        <div className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-red-500/15 bg-red-500/[0.035] px-6 text-center">
          <ExclamationTriangleIcon className="size-8 text-red-400" />
          <p className="mt-4 text-sm font-medium text-zinc-200">No pudimos cargar el centro de operaciones</p>
          <p className="mt-1 text-sm text-zinc-500">Tus eventos permanecen intactos. Intenta nuevamente.</p>
          <Button className="mt-5" outline onClick={() => mutateEvents()}>
            Reintentar
          </Button>
        </div>
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-12">
            <motion.section
              initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
              className="relative min-h-64 overflow-hidden rounded-3xl border border-indigo-400/15 bg-zinc-950 p-6 shadow-2xl shadow-black/20 lg:col-span-8 lg:p-8"
            >
              <div className="pointer-events-none absolute -top-40 -right-28 size-96 rounded-full bg-indigo-500/12 blur-3xl" />
              <div className="pointer-events-none absolute right-20 -bottom-44 size-80 rounded-full bg-violet-500/8 blur-3xl" />

              {nextEvent ? (
                <div className="relative flex h-full flex-col justify-between gap-10">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="indigo">Próximo evento</Badge>
                      <span className="text-xs text-zinc-500">
                        {getDaysUntil(nextEvent.event_date_time, nextEvent.timezone) === 0
                          ? 'Hoy'
                          : `En ${getDaysUntil(nextEvent.event_date_time, nextEvent.timezone)} días`}
                      </span>
                    </div>
                    <Link
                      href={`/events/${nextEvent.id}`}
                      onFocus={() => preloadEventDetail(nextEvent)}
                      onPointerDown={() => preloadEventDetail(nextEvent)}
                      onPointerEnter={() => preloadEventDetail(nextEvent)}
                      className="group mt-5 inline-block max-w-full"
                    >
                      <h2 className="truncate text-3xl font-semibold tracking-tight text-white transition-colors group-hover:text-indigo-200 lg:text-4xl">
                        {nextEvent.name}
                      </h2>
                    </Link>
                    <p className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
                      <CalendarDaysIcon className="size-4 text-zinc-600" />
                      {formatEventDate(nextEvent.event_date_time, nextEvent.timezone, {
                        weekday: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-5 border-t border-white/8 pt-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-h-4 flex-wrap gap-x-5 gap-y-2 text-xs">
                      <>
                        <span className="flex items-center gap-1.5 text-zinc-400">
                          <UsersIcon className="size-4 text-zinc-600" />
                          {`${nextGuestSummary?.total ?? 0} invitados`}
                        </span>
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircleIcon className="size-4" />
                          {`${nextGuestSummary?.confirmed ?? 0} confirmados`}
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <ClockIcon className="size-4" />
                          {`${nextGuestSummary?.pending ?? 0} pendientes`}
                        </span>
                      </>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        href={`/events/${nextEvent.id}/studio`}
                        outline
                        onFocus={() => preloadEventStudio(nextEvent.id)}
                        onPointerDown={() => preloadEventStudio(nextEvent.id)}
                        onPointerEnter={() => preloadEventStudio(nextEvent.id)}
                      >
                        <PaintBrushIcon />
                        Studio
                      </Button>
                      <Button
                        href={`/events/${nextEvent.id}`}
                        color="indigo"
                        onFocus={() => preloadEventDetail(nextEvent)}
                        onPointerDown={() => preloadEventDetail(nextEvent)}
                        onPointerEnter={() => preloadEventDetail(nextEvent)}
                      >
                        Abrir evento
                        <ArrowRightIcon />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col justify-between gap-10">
                  <div>
                    <span className="flex size-11 items-center justify-center rounded-2xl border border-indigo-400/15 bg-indigo-500/10 text-indigo-300">
                      <BoltIcon className="size-5" />
                    </span>
                    <p className="mt-6 text-xs font-semibold tracking-wider text-indigo-400 uppercase">
                      Agenda disponible
                    </p>
                    <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight text-white lg:text-4xl">
                      Tu próximo gran evento empieza aquí.
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                      No hay eventos próximos. Crea uno nuevo o revisa los eventos que ya concluyeron.
                    </p>
                  </div>
                  <div>
                    <Button href="/events" color="indigo">
                      Planear nuevo evento
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              )}
            </motion.section>

            <section aria-label="Resumen" className="grid grid-cols-2 gap-4 lg:col-span-4">
              <Metric
                icon={CalendarDaysIcon}
                label="Total"
                value={metrics.total}
                detail="eventos registrados"
                delay={0.08}
                reducedMotion={reducedMotion}
              />
              <Metric
                icon={BoltIcon}
                label="Activos"
                value={metrics.active}
                detail="publicados o en trabajo"
                delay={0.13}
                reducedMotion={reducedMotion}
              />
              <Metric
                icon={ClockIcon}
                label="Próximos"
                value={metrics.upcoming}
                detail="en tu agenda"
                delay={0.18}
                reducedMotion={reducedMotion}
              />
              <Metric
                icon={UsersIcon}
                label="Capacidad"
                value={metrics.total_capacity}
                detail="invitados en total"
                delay={0.23}
                reducedMotion={reducedMotion}
              />
            </section>
          </div>

          <div className="mt-12 grid gap-10 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]">
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <Subheading className="text-base/6">Eventos activos</Subheading>
                  <p className="mt-1 text-xs text-zinc-600">Acceso rápido a la operación actual.</p>
                </div>
                {activeEvents.length > 0 && (
                  <Link href="/events" className="text-xs font-medium text-zinc-500 transition-colors hover:text-white">
                    Ver todos
                  </Link>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/7 bg-white/[0.02]">
                {activeEvents.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <CalendarDaysIcon className="size-8 text-zinc-700" />
                    <p className="mt-3 text-sm font-medium text-zinc-300">No hay eventos activos</p>
                    <p className="mt-1 text-xs text-zinc-600">Tu operación aparecerá aquí cuando crees un evento.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {activeEvents.slice(0, 5).map((event) => {
                      const daysUntil = getDaysUntil(event.event_date_time, event.timezone)
                      const isPast = daysUntil !== null && daysUntil < 0
                      return (
                        <motion.li
                          key={event.id}
                          initial={reducedMotion ? false : { opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={
                            reducedMotion ? { duration: 0 } : { duration: 0.28, delay: 0.28, ease: 'easeOut' }
                          }
                        >
                          <Link
                            href={`/events/${event.id}`}
                            onFocus={() => preloadEventDetail(event)}
                            onPointerDown={() => preloadEventDetail(event)}
                            onPointerEnter={() => preloadEventDetail(event)}
                            className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.035] sm:px-5"
                          >
                            <span
                              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                                isPast ? 'bg-zinc-800/70 text-zinc-500' : 'bg-indigo-500/10 text-indigo-400'
                              }`}
                            >
                              <CalendarDaysIcon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-zinc-200 transition-colors group-hover:text-white">
                                {event.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-zinc-600">
                                {eventTypeLabel(event.event_type?.name) || 'Evento'} ·{' '}
                                {formatEventDate(event.event_date_time, event.timezone)}
                              </span>
                            </span>
                            <Badge color={isPast ? 'zinc' : daysUntil === 0 ? 'amber' : 'lime'}>
                              {daysUntil === null
                                ? 'Sin fecha'
                                : daysUntil === 0
                                  ? 'Hoy'
                                  : isPast
                                    ? 'Finalizado'
                                    : `En ${daysUntil}d`}
                            </Badge>
                            <ArrowRightIcon className="size-4 shrink-0 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                          </Link>
                        </motion.li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </section>

            <aside>
              <Subheading className="text-base/6">Prioridades</Subheading>
              <p className="mt-1 text-xs text-zinc-600">Señales que requieren tu atención.</p>

              <div className="mt-4 space-y-3">
                {metrics.past_active > 0 ? (
                  <Link
                    href="/events"
                    className="group flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.045] p-4 transition-colors hover:border-amber-500/25 hover:bg-amber-500/[0.07]"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                      <ExclamationTriangleIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-200">
                        {metrics.past_active} evento{metrics.past_active === 1 ? '' : 's'} finalizado
                        {metrics.past_active === 1 ? '' : 's'} sigue{metrics.past_active === 1 ? '' : 'n'} activo
                        {metrics.past_active === 1 ? '' : 's'}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">
                        Revisa su publicación y estado operativo.
                      </span>
                    </span>
                    <ArrowRightIcon className="mt-2 size-4 shrink-0 text-amber-500/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/12 bg-emerald-500/[0.035] p-4">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <CheckCircleIcon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Todo al día</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">No hay eventos finalizados aún activos.</p>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-4">
                  <p className="text-xs font-medium text-zinc-400">Próxima ventana operativa</p>
                  <p className="mt-2 text-sm text-zinc-200">
                    {nextEvent
                      ? `${nextEvent.name} · ${formatEventDate(nextEvent.event_date_time, nextEvent.timezone)}`
                      : 'Sin eventos próximos programados'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    {nextEvent
                      ? 'El acceso a Studio y operación está listo.'
                      : 'La agenda está disponible para un nuevo evento.'}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </PageTransition>
  )
}
