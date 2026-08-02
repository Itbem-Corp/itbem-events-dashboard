'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { preloadEventWorkspace } from '@/components/events/preload-event-workspace'
import { Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useScopedFetcherKey, useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { accessCan, createAccessProfile, type AccessProfile } from '@/lib/access-profile'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsDashboardPath } from '@/lib/api-paths'
import { getCalendarDaysUntil } from '@/lib/date-time'
import { eventTypeLabel } from '@/lib/event-type-label'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { TenantCode } from '@/lib/tenant-config'
import type { Event, EventDashboardOverview } from '@/models/Event'
import { productSupportsFeature } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import {
  ArrowRightIcon,
  BoltIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaintBrushIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
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
}: {
  icon: Icon
  label: string
  value: number
  detail: string
  delay: number
}) {
  return (
    <div
      className="dashboard-reveal premium-surface premium-surface-interactive group rounded-2xl border p-4 hover:border-(--tenant-accent)/25"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink-muted">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-(--tenant-accent)/8 text-ink-muted transition-colors group-hover:text-(--tenant-accent)">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-ink tabular-nums">
        {value.toLocaleString('es-MX')}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-12">
      <div className="h-64 animate-pulse rounded-3xl bg-surface lg:col-span-8" />
      <div className="grid grid-cols-2 gap-4 lg:col-span-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-30 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  )
}

function organizationWorkspaceCopy(accessProfile: AccessProfile, organizationName?: string) {
  const role = (accessProfile.organizationRole ?? '').replace('INHERITED_', '').toUpperCase()
  if (accessProfile.platformLevel === 'root_1') {
    return {
      eyebrow: 'Supervisión de organización',
      title: organizationName || 'Organización',
      description: 'Gobierno, operación y resultados del espacio seleccionado.',
    }
  }
  if (accessProfile.platformLevel === 'root_2') {
    return {
      eyebrow: 'Soporte operativo',
      title: organizationName || 'Organización',
      description: 'Asistencia a invitados, check-in y analítica sin cambios estructurales.',
    }
  }
  switch (role) {
    case 'OWNER':
      return {
        eyebrow: 'Dirección de organización',
        title: organizationName || 'Tu organización',
        description: 'Equipo, eventos y resultados bajo una sola operación.',
      }
    case 'ADMIN':
      return {
        eyebrow: 'Administración',
        title: organizationName || 'Tu organización',
        description: 'Coordina el equipo y mantiene la operación lista para crecer.',
      }
    case 'EVENT_MANAGER':
      return {
        eyebrow: 'Centro de eventos',
        title: 'Operación y producción',
        description: 'Planea eventos, coordina invitados y sigue cada resultado.',
      }
    case 'EDITOR':
      return {
        eyebrow: 'Contenido y experiencia',
        title: 'Eventos listos para publicar',
        description: 'Edita estructura, contenido e invitados sin acciones destructivas.',
      }
    case 'CHECKIN':
      return {
        eyebrow: 'Operación de acceso',
        title: 'Check-in sin fricción',
        description: 'Consulta próximos eventos y mantén ágil la llegada de invitados.',
      }
    case 'ANALYST':
      return {
        eyebrow: 'Resultados',
        title: 'Lectura de operación',
        description: 'Analiza actividad, capacidad y desempeño sin modificar la experiencia.',
      }
    case 'MEMBER':
      return {
        eyebrow: 'Colaboración',
        title: 'Tus eventos asignados',
        description: 'Apoya la gestión de invitados dentro de un espacio controlado.',
      }
    default:
      return {
        eyebrow: 'Vista de consulta',
        title: organizationName || 'Eventos',
        description: 'Consulta agenda y estado sin permisos de modificación.',
      }
  }
}

function ControlPlaneHome({
  accessProfile,
  organizationName,
}: {
  accessProfile: AccessProfile
  organizationName?: string
}) {
  const session = useStore((state) => state.applicationSession)
  const organizationCount = session?.organizations.length ?? 0
  const product = getProductManifest((session?.application.code as TenantCode) || 'eventiapp')
  const canViewOrganizations =
    accessProfile.isPlatformContext &&
    productSupportsFeature(product, 'organizations') &&
    accessCan(accessProfile, 'organizations:view')
  const canViewPlatformUsers =
    accessProfile.isPlatformContext &&
    productSupportsFeature(product, 'users') &&
    accessCan(accessProfile, 'platform:users:view')
  const canManageTeam =
    accessProfile.isOrganizationContext &&
    productSupportsFeature(product, 'team') &&
    accessCan(accessProfile, 'members:manage')
  const canViewMetrics = productSupportsFeature(product, 'metrics') && accessCan(accessProfile, 'metrics:view')
  const canViewAudit =
    accessProfile.isPlatformContext &&
    productSupportsFeature(product, 'audit') &&
    accessCan(accessProfile, 'audit:view')
  const peopleHref = canViewPlatformUsers ? '/users' : '/team'
  const peopleTitle = canViewPlatformUsers ? 'Identidad y permisos' : 'Equipo y accesos'
  const peopleDescription = canViewPlatformUsers
    ? 'Usuarios, roles y acceso por aplicación.'
    : 'Miembros, roles y acceso por producto.'
  const isOperationalRoot = accessProfile.platformLevel === 'root_2'
  const organizationCopy = organizationWorkspaceCopy(accessProfile, organizationName)

  if (accessProfile.isOrganizationContext) {
    return (
      <PageTransition>
        <PageHeader
          eyebrow={organizationCopy.eyebrow}
          title={organizationCopy.title}
          description={organizationCopy.description}
          icon={BuildingOfficeIcon}
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {canViewMetrics && (
            <Link href="/metrics" className="premium-surface premium-surface-interactive group rounded-3xl p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-(--tenant-accent)">
                <BoltIcon className="size-5" />
              </span>
              <div className="mt-8 flex items-end justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-ink">Actividad y métricas</p>
                  <p className="mt-1 text-sm text-ink-muted">Uso, personas activas y salud de esta organización.</p>
                </div>
                <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-(--tenant-accent)" />
              </div>
            </Link>
          )}

          {canManageTeam && (
            <Link href="/team" className="premium-surface premium-surface-interactive group rounded-3xl p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-ink-secondary">
                <UsersIcon className="size-5" />
              </span>
              <div className="mt-8 flex items-end justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-ink">Equipo y accesos</p>
                  <p className="mt-1 text-sm text-ink-muted">Miembros y roles limitados a este espacio.</p>
                </div>
                <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
              </div>
            </Link>
          )}

          {!canViewMetrics && !canManageTeam && (
            <div className="premium-surface rounded-3xl p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-ink-secondary">
                <ShieldCheckIcon className="size-5" />
              </span>
              <div className="mt-8">
                <p className="text-lg font-semibold text-ink">Espacio de colaboración</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  Tu acceso está limitado a las herramientas que te asignó el propietario de la organización.
                </p>
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={isOperationalRoot ? 'Administración operativa' : 'Control plane'}
        title={isOperationalRoot ? 'Centro de soporte' : 'Operación de plataforma'}
        description={
          isOperationalRoot
            ? 'Resuelve accesos, acompaña organizaciones y revisa señales operativas sin alterar gobierno ni estructura crítica.'
            : canViewOrganizations || canViewPlatformUsers
              ? 'Administra organizaciones, accesos y usuarios desde un espacio separado de la operación diaria.'
              : 'Supervisa actividad, salud y trazabilidad sin mezclarla con la operación diaria de eventos.'
        }
        icon={ShieldCheckIcon}
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {canViewOrganizations && (
          <Link
          href="/clients"
          className="premium-surface premium-surface-interactive group relative overflow-hidden rounded-3xl p-6"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-(--tenant-accent) to-transparent opacity-60" />
          <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-(--tenant-accent)">
            <BuildingOfficeIcon className="size-5" />
          </span>
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold text-ink tabular-nums">{organizationCount}</p>
              <p className="mt-1 text-sm font-medium text-ink-secondary">Organizaciones con acceso directo</p>
              <p className="mt-1 text-xs text-ink-muted">
                {isOperationalRoot ? 'Abre un contexto para brindar soporte.' : 'Gestiona estructura, clientes y configuración.'}
              </p>
            </div>
            <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-(--tenant-accent)" />
          </div>
          </Link>
        )}

        {(canViewPlatformUsers || canManageTeam) && (
          <Link href={peopleHref} className="premium-surface premium-surface-interactive group rounded-3xl p-6">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-ink-secondary">
              <UsersIcon className="size-5" />
            </span>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-ink">{peopleTitle}</p>
                <p className="mt-1 text-sm text-ink-muted">{peopleDescription}</p>
              </div>
              <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
            </div>
          </Link>
        )}

        {canViewMetrics && (
          <Link href="/metrics" className="premium-surface premium-surface-interactive group rounded-3xl p-6">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-emerald-500 dark:text-emerald-300">
              <BoltIcon className="size-5" />
            </span>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-ink">Señales operativas</p>
                <p className="mt-1 text-sm text-ink-muted">Actividad y salud del producto por organización.</p>
              </div>
              <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-emerald-300" />
            </div>
          </Link>
        )}

        {canViewAudit && (
          <Link href="/audit" className="premium-surface premium-surface-interactive group rounded-3xl p-6">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-interactive text-(--tenant-accent)">
              <ClipboardDocumentCheckIcon className="size-5" />
            </span>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-ink">Auditoría de plataforma</p>
                <p className="mt-1 text-sm text-ink-muted">Accesos, cambios y resultados operativos trazables.</p>
              </div>
              <ArrowRightIcon className="size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-(--tenant-accent)" />
            </div>
          </Link>
        )}
      </div>

      {isOperationalRoot && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-400/12 bg-amber-400/[0.035] p-4">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-medium text-ink">Límite de soporte activo</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Este nivel puede asistir usuarios, invitados y check-in. La creación o eliminación de eventos, los usuarios
              root y la configuración estructural permanecen reservados a Root 1.
            </p>
          </div>
        </div>
      )}
    </PageTransition>
  )
}

export default function Home() {
  const scopeFetcherKey = useScopedFetcherScope()
  const router = useRouter()
  const currentClient = useStore((state) => state.currentClient)
  const user = useStore((state) => state.user)
  const applicationSession = useStore((state) => state.applicationSession)
  const workspaceMode = useStore((state) => state.workspaceMode)
  const isRoot = Boolean(user?.is_root)
  const accessProfile = useMemo(
    () => createAccessProfile(applicationSession, workspaceMode, currentClient?.id),
    [applicationSession, currentClient?.id, workspaceMode]
  )
  const hasEvents = applicationSession ? accessCan(accessProfile, 'events:view') : true
  const canCreateEvents = accessCan(accessProfile, 'events:create')
  const canEditEvents = accessCan(accessProfile, 'events:manage')
  const organizationRole = (accessProfile.organizationRole ?? '').replace('INHERITED_', '').toUpperCase()
  const workspaceCopy = organizationWorkspaceCopy(accessProfile, currentClient?.name)
  const eventsKey =
    hasEvents && !accessProfile.isPlatformContext ? scopedEventsDashboardPath(currentClient?.id, isRoot) : null
  const scopedEventsKey = useScopedFetcherKey(eventsKey)
  const {
    data: rawEvents,
    isLoading: eventsLoading,
    isValidating: eventsValidating,
    error: eventsError,
    mutate: mutateEvents,
  } = useSWR<EventDashboardOverview>(scopedEventsKey, fetcher, responsiveListSwrOptions)
  const isLoading = Boolean(!eventsKey || eventsLoading)
  const overview = useMemo(() => readApiData<EventDashboardOverview | undefined>(rawEvents), [rawEvents])
  const eventsErrorState = getDataErrorState(eventsError, rawEvents)

  const activeEvents = overview?.active_events ?? EMPTY_EVENTS
  const nextEvent = overview?.next_event ?? undefined
  const metrics = overview?.metrics ?? EMPTY_METRICS

  const nextGuestSummary = overview?.next_event_guest_summary
  const primaryEventHref = nextEvent
    ? organizationRole === 'CHECKIN'
      ? `/events/${nextEvent.id}/checkin`
      : organizationRole === 'ANALYST'
        ? `/events/${nextEvent.id}?tab=analiticas`
        : organizationRole === 'MEMBER'
          ? `/events/${nextEvent.id}?tab=invitados`
          : `/events/${nextEvent.id}`
    : '/events'
  const primaryEventLabel =
    organizationRole === 'CHECKIN'
      ? 'Abrir check-in'
      : organizationRole === 'ANALYST'
        ? 'Ver analíticas'
        : organizationRole === 'MEMBER'
          ? 'Gestionar invitados'
          : 'Abrir evento'

  const preloadEventDetail = useCallback(
    (event: Event) => {
      router.prefetch(`/events/${event.id}`)
      void preloadEventWorkspace(event, scopeFetcherKey).catch(() => undefined)
    },
    [router, scopeFetcherKey]
  )

  const preloadEventStudio = useCallback(
    (eventId: string) => {
      router.prefetch(`/events/${eventId}/studio`)
      void import('@/components/studio/preload-studio-panel')
        .then((module) => module.preloadStudioWorkspace(eventId, scopeFetcherKey))
        .catch(() => undefined)
    },
    [router, scopeFetcherKey]
  )

  const preloadEventCreation = useCallback(() => {
    router.prefetch('/events?create=1')
    void import('@/components/events/forms/event-form-modal').catch(() => undefined)
  }, [router])

  if (applicationSession && (accessProfile.isPlatformContext || !hasEvents)) {
    return <ControlPlaneHome accessProfile={accessProfile} organizationName={currentClient?.name} />
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={workspaceCopy.eyebrow}
        title={workspaceCopy.title}
        description={workspaceCopy.description}
        icon={SparklesIcon}
        actions={
          canCreateEvents ? (
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
          ) : undefined
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
          <p className="mt-4 text-sm font-medium text-ink">No pudimos cargar el centro de operaciones</p>
          <p className="mt-1 text-sm text-ink-muted">Tus eventos permanecen intactos. Intenta nuevamente.</p>
          <Button className="mt-5" outline onClick={() => mutateEvents()}>
            Reintentar
          </Button>
        </div>
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-12">
            <section
              className="dashboard-reveal app-hero-surface relative min-h-64 overflow-hidden rounded-3xl border p-6 lg:col-span-8 lg:p-8"
            >
              {nextEvent ? (
                <div className="relative flex h-full flex-col justify-between gap-10">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="indigo">Próximo evento</Badge>
                      <span className="text-xs text-ink-muted">
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
                      <h2 className="truncate text-3xl font-semibold tracking-tight text-ink transition-colors group-hover:text-(--tenant-accent) lg:text-4xl">
                        {nextEvent.name}
                      </h2>
                    </Link>
                    <p className="mt-3 flex items-center gap-2 text-sm text-ink-secondary">
                      <CalendarDaysIcon className="size-4 text-ink-muted" />
                      {formatEventDate(nextEvent.event_date_time, nextEvent.timezone, {
                        weekday: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-5 border-t border-border-subtle pt-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-h-4 flex-wrap gap-x-5 gap-y-2 text-xs">
                      <>
                        <span className="flex items-center gap-1.5 text-ink-secondary">
                          <UsersIcon className="size-4 text-ink-muted" />
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
                      {canEditEvents && (
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
                      )}
                      <Button
                        href={primaryEventHref}
                        color="indigo"
                        onFocus={() => preloadEventDetail(nextEvent)}
                        onPointerDown={() => preloadEventDetail(nextEvent)}
                        onPointerEnter={() => preloadEventDetail(nextEvent)}
                      >
                        {primaryEventLabel}
                        <ArrowRightIcon />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col justify-between gap-10">
                  <div>
                    <span className="flex size-11 items-center justify-center rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/10 text-(--tenant-accent)">
                      <BoltIcon className="size-5" />
                    </span>
                    <p className="mt-6 text-xs font-semibold tracking-wider text-(--tenant-accent) uppercase">
                      Agenda disponible
                    </p>
                    <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight text-ink lg:text-4xl">
                      Tu próximo gran evento empieza aquí.
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
                      {canCreateEvents
                        ? 'No hay eventos próximos. Crea uno nuevo o revisa los eventos que ya concluyeron.'
                        : 'No hay eventos próximos. Puedes consultar el portafolio y los eventos que ya concluyeron.'}
                    </p>
                  </div>
                  <div>
                    <Button href={canCreateEvents ? '/events?create=1' : '/events'} color="indigo">
                      {canCreateEvents ? 'Planear nuevo evento' : 'Consultar eventos'}
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section aria-label="Resumen" className="grid grid-cols-2 gap-4 lg:col-span-4">
              <Metric
                icon={CalendarDaysIcon}
                label="Total"
                value={metrics.total}
                detail="eventos registrados"
                delay={0.08}
              />
              <Metric
                icon={BoltIcon}
                label="Activos"
                value={metrics.active}
                detail="publicados o en trabajo"
                delay={0.13}
              />
              <Metric
                icon={ClockIcon}
                label="Próximos"
                value={metrics.upcoming}
                detail="en tu agenda"
                delay={0.18}
              />
              <Metric
                icon={UsersIcon}
                label="Capacidad"
                value={metrics.total_capacity}
                detail="invitados en total"
                delay={0.23}
              />
            </section>
          </div>

          <div className="mt-12 grid gap-10 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]">
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <Subheading className="text-base/6">Eventos activos</Subheading>
                  <p className="mt-1 text-xs text-ink-muted">Acceso rápido a la operación actual.</p>
                </div>
                {activeEvents.length > 0 && (
                  <Link href="/events" className="text-xs font-medium text-ink-muted transition-colors hover:text-ink">
                    Ver todos
                  </Link>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
                {activeEvents.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <CalendarDaysIcon className="size-8 text-ink-muted" />
                    <p className="mt-3 text-sm font-medium text-ink-secondary">No hay eventos activos</p>
                    <p className="mt-1 text-xs text-ink-muted">Tu operación aparecerá aquí cuando crees un evento.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {activeEvents.slice(0, 5).map((event) => {
                      const daysUntil = getDaysUntil(event.event_date_time, event.timezone)
                      const isPast = daysUntil !== null && daysUntil < 0
                      return (
                        <li
                          key={event.id}
                          className="dashboard-reveal"
                          style={{ animationDelay: '0.28s' }}
                        >
                          <Link
                            href={`/events/${event.id}`}
                            onFocus={() => preloadEventDetail(event)}
                            onPointerDown={() => preloadEventDetail(event)}
                            onPointerEnter={() => preloadEventDetail(event)}
                            className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-interactive sm:px-5"
                          >
                            <span
                              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                                isPast ? 'bg-surface-soft text-ink-muted' : 'bg-(--tenant-accent)/10 text-(--tenant-accent)'
                              }`}
                            >
                              <CalendarDaysIcon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink transition-colors group-hover:text-(--tenant-accent)">
                                {event.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-ink-muted">
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
                            <ArrowRightIcon className="size-4 shrink-0 text-ink-muted transition-all group-hover:translate-x-0.5 group-hover:text-ink-secondary" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </section>

            <aside>
              <Subheading className="text-base/6">Prioridades</Subheading>
              <p className="mt-1 text-xs text-ink-muted">Señales que requieren tu atención.</p>

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
                      <span className="block text-sm font-medium text-ink">
                        {metrics.past_active} evento{metrics.past_active === 1 ? '' : 's'} finalizado
                        {metrics.past_active === 1 ? '' : 's'} sigue{metrics.past_active === 1 ? '' : 'n'} activo
                        {metrics.past_active === 1 ? '' : 's'}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-ink-muted">
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
                      <p className="text-sm font-medium text-ink">Todo al día</p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">No hay eventos finalizados aún activos.</p>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
                  <p className="text-xs font-medium text-ink-secondary">Próxima ventana operativa</p>
                  <p className="mt-2 text-sm text-ink">
                    {nextEvent
                      ? `${nextEvent.name} · ${formatEventDate(nextEvent.event_date_time, nextEvent.timezone)}`
                      : 'Sin eventos próximos programados'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {nextEvent
                      ? organizationRole === 'CHECKIN'
                        ? 'La lista de acceso está lista para operar.'
                        : organizationRole === 'ANALYST'
                          ? 'La lectura de resultados está disponible.'
                          : organizationRole === 'MEMBER'
                            ? 'La colaboración de invitados está disponible.'
                            : 'El acceso a Studio y operación está listo.'
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
