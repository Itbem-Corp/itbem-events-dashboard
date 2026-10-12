'use client'

import { preloadEventWorkspace } from '@/components/events/preload-event-workspace'
import { Link } from '@/components/link'
import { readApiList } from '@/lib/api-envelope'
import { eventNotificationsPath } from '@/lib/api-paths'
import { getCalendarDaysUntil } from '@/lib/date-time'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event } from '@/models/Event'
import { useProductShell } from '@/products/core/product-context'
import { useStore } from '@/store/useStore'
import { useScopedFetcherKey, useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import {
  ArrowRightIcon,
  BellIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { anchoredPanelPosition, type AnchoredPanelPosition } from '@/lib/anchored-panel-position'
import useSWR, { preload } from 'swr'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string, timeZone?: string | null): number | null {
  return getCalendarDaysUntil(dateString, timeZone)
}

interface Notification {
  id: string
  type: 'today' | 'soon' | 'past'
  title: string
  body: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  event: Event
}

function buildNotifications(events: Event[]): Notification[] {
  const notes: Notification[] = []

  for (const event of events) {
    const days = getDaysUntil(event.event_date_time, event.timezone)
    if (days === null) continue

    if (days === 0) {
      notes.push({
        id: `today-${event.id}`,
        type: 'today',
        title: '¡Evento hoy!',
        body: event.name,
        href: `/events/${event.id}`,
        icon: ExclamationTriangleIcon,
        color: 'text-amber-400',
        event,
      })
    } else if (days > 0 && days <= 3) {
      notes.push({
        id: `soon-${event.id}`,
        type: 'soon',
        title: `En ${days} día${days !== 1 ? 's' : ''}`,
        body: event.name,
        href: `/events/${event.id}`,
        icon: CalendarDaysIcon,
        color: 'text-indigo-400',
        event,
      })
    } else if (days < 0 && days >= -3) {
      notes.push({
        id: `past-${event.id}`,
        type: 'past',
        title: `Terminó hace ${Math.abs(days)}d`,
        body: event.name,
        href: `/events/${event.id}`,
        icon: CheckCircleIcon,
        color: 'text-ink-muted',
        event,
      })
    }
  }

  // today first, then upcoming by days asc, then past
  return notes.sort((a, b) => {
    const order = { today: 0, soon: 1, past: 2 }
    return order[a.type] - order[b.type]
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({ initialOpen = false }: { initialOpen?: boolean }) {
  const router = useRouter()
  const accessibleShell = Boolean(useProductShell()?.accessibleShell)
  const [open, setOpen] = useState(initialOpen)
  const [hasOpened, setHasOpened] = useState(initialOpen)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const focusedOnOpenRef = useRef(false)
  const panelId = useId()
  const [position, setPosition] = useState<AnchoredPanelPosition | null>(null)
  const currentClient = useStore((state) => state.currentClient)
  const eventsKey = eventNotificationsPath(currentClient?.id)
  const scopedEventsKey = useScopedFetcherKey(hasOpened ? eventsKey : null)
  const scopeFetcherKey = useScopedFetcherScope()

  const {
    data: rawEvents,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<Event[] | { data?: Event[] }>(scopedEventsKey, fetcher, responsiveListSwrOptions)
  const events = useMemo(() => readApiList<Event>(rawEvents), [rawEvents])
  const dataErrorState = getDataErrorState(error, rawEvents)

  const notifications = buildNotifications(events)
  const count = notifications.filter((n) => n.type !== 'past').length

  function preloadEventsList() {
    router.prefetch('/events')
    if (eventsKey) void preload(scopeFetcherKey(eventsKey), fetcher).catch(() => undefined)
  }

  function preloadNotification(event: Event) {
    router.prefetch(`/events/${event.id}`)
    void preloadEventWorkspace(event, scopeFetcherKey).catch(() => undefined)
  }

  // The panel is portaled to <body> so the sidebar's overflow cannot clip it;
  // it is positioned against the bell and follows it on resize/scroll.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    function place() {
      const anchor = buttonRef.current?.getBoundingClientRect()
      if (anchor) setPosition(anchoredPanelPosition(anchor, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Move focus into the panel once per opening. `position` changes on every
  // scroll/resize, and refocusing then would pull keyboard focus off the
  // notification link the user is on.
  useEffect(() => {
    if (!open) {
      focusedOnOpenRef.current = false
      return
    }
    if (position && !focusedOnOpenRef.current) {
      focusedOnOpenRef.current = true
      panelRef.current?.focus()
    }
  }, [open, position])

  // Close on outside press and on Escape (focus returns to the bell).
  useEffect(() => {
    if (!open) return
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        ref={buttonRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setHasOpened(true)
          setOpen((value) => !value)
        }}
        onPointerEnter={() => setHasOpened(true)}
        onFocus={() => setHasOpened(true)}
        className={`relative flex ${accessibleShell ? 'size-11 lg:size-9' : 'size-8'} items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)`}
        aria-label="Notificaciones"
      >
        <BellIcon className="size-5" />
        {count > 0 &&
          (accessibleShell ? (
            // Wide enough for two digits at 12px.
            <span
              data-testid="notification-count"
              className="absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--tenant-accent) px-1 text-xs leading-none font-bold text-white tabular-nums lg:-top-0.5 lg:-right-0.5"
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-(--tenant-accent) text-[9px] font-bold text-white">
              {count > 9 ? '9+' : count}
            </span>
          ))}
      </button>

      {open && position && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notificaciones"
          tabIndex={-1}
          style={{ position: 'fixed', top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          className="z-50 flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-[0_20px_60px_var(--app-shadow-strong)] focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notificaciones</p>
            {count > 0 && (
              <span className={`rounded-full bg-(--tenant-accent)/15 px-2 py-0.5 ${accessibleShell ? 'text-xs' : 'text-[10px]'} font-semibold text-(--tenant-accent)`}>
                {count} activa{count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] min-h-0 flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="space-y-3 px-4 py-5" role="status" aria-label="Cargando notificaciones">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="skeleton size-4 rounded" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="skeleton h-3 w-20 rounded" />
                      <div className="skeleton h-3 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : dataErrorState === 'fatal' ? (
              <div className="px-4 py-7 text-center" role="alert">
                <ExclamationTriangleIcon className="mx-auto mb-2 size-6 text-amber-400" />
                <p className="text-sm text-ink-secondary">No pudimos cargar tus notificaciones.</p>
                <button
                  type="button"
                  onClick={() => void mutate()}
                  disabled={isValidating}
                  className="mt-2 text-xs font-semibold text-(--tenant-accent) hover:text-ink disabled:opacity-60"
                >
                  {isValidating ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BellIcon className="mx-auto mb-2 size-7 text-ink-muted" />
                <p className="text-sm text-ink-muted">Sin notificaciones activas</p>
                <p className="mt-1 text-xs text-ink-muted">Te avisamos cuando un evento esté próximo.</p>
              </div>
            ) : (
              notifications.map((n, index) => {
                const Icon = n.icon
                // "N activas" counts today/soon only; finished events are listed
                // under their own heading so the badge matches what it labels.
                const firstPast = n.type === 'past' && notifications[index - 1]?.type !== 'past'
                return (
                  <Fragment key={n.id}>
                  {firstPast && (
                    <p
                      className={`px-4 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase ${index > 0 ? 'mt-1 border-t border-border-subtle' : ''}`}
                    >
                      Terminados recientemente
                    </p>
                  )}
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    onFocus={() => preloadNotification(n.event)}
                    onPointerDown={() => preloadNotification(n.event)}
                    onPointerEnter={() => preloadNotification(n.event)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-interactive"
                  >
                    <div className={`mt-0.5 shrink-0 ${n.color}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${n.color}`}>{n.title}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-secondary">{n.body}</p>
                    </div>
                  </Link>
                  </Fragment>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-subtle px-4 py-2.5">
            <Link
              href="/events"
              onClick={() => setOpen(false)}
              onFocus={preloadEventsList}
              onPointerDown={preloadEventsList}
              onPointerEnter={preloadEventsList}
              className="inline-flex min-h-10 items-center gap-1.5 text-xs text-(--tenant-accent) transition-colors hover:text-ink"
            >
              Ver todos los eventos
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
