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
import { useStore } from '@/store/useStore'
import {
  ArrowRightIcon,
  BellIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(initialOpen)
  const [hasOpened, setHasOpened] = useState(initialOpen)
  const ref = useRef<HTMLDivElement>(null)
  const currentClient = useStore((state) => state.currentClient)
  const eventsKey = eventNotificationsPath(currentClient?.id)

  const {
    data: rawEvents,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<Event[] | { data?: Event[] }>(hasOpened ? eventsKey : null, fetcher, responsiveListSwrOptions)
  const events = useMemo(() => readApiList<Event>(rawEvents), [rawEvents])
  const dataErrorState = getDataErrorState(error, rawEvents)

  const notifications = buildNotifications(events)
  const count = notifications.filter((n) => n.type !== 'past').length

  function preloadEventsList() {
    router.prefetch('/events')
    if (eventsKey) void preload(eventsKey, fetcher).catch(() => undefined)
  }

  function preloadNotification(event: Event) {
    router.prefetch(`/events/${event.id}`)
    void preloadEventWorkspace(event).catch(() => undefined)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setHasOpened(true)
          setOpen((value) => !value)
        }}
        onPointerEnter={() => setHasOpened(true)}
        onFocus={() => setHasOpened(true)}
        className="relative flex size-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label="Notificaciones"
      >
        <BellIcon className="size-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-2xl border border-white/10 bg-surface shadow-2xl shadow-black/40">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notificaciones</p>
            {count > 0 && (
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                {count} activa{count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto py-1">
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
                  className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-60"
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
              notifications.map((n) => {
                const Icon = n.icon
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    onFocus={() => preloadNotification(n.event)}
                    onPointerDown={() => preloadNotification(n.event)}
                    onPointerEnter={() => preloadNotification(n.event)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className={`mt-0.5 shrink-0 ${n.color}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${n.color}`}>{n.title}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-secondary">{n.body}</p>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 px-4 py-2.5">
            <Link
              href="/events"
              onClick={() => setOpen(false)}
              onFocus={preloadEventsList}
              onPointerDown={preloadEventsList}
              onPointerEnter={preloadEventsList}
              className="inline-flex min-h-10 items-center gap-1.5 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Ver todos los eventos
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
