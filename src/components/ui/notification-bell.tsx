'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from '@/components/link'
import type { Event } from '@/models/Event'
import {
  BellIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/20/solid'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string): number {
  return Math.ceil(
    (new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
}

interface Notification {
  id: string
  type: 'today' | 'soon' | 'past'
  title: string
  body: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

function buildNotifications(events: Event[]): Notification[] {
  const notes: Notification[] = []

  for (const event of events) {
    const days = getDaysUntil(event.event_date_time)

    if (days === 0) {
      notes.push({
        id: `today-${event.id}`,
        type: 'today',
        title: '¡Evento hoy!',
        body: event.name,
        href: `/events/${event.id}`,
        icon: ExclamationTriangleIcon,
        color: 'text-amber-400',
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
      })
    } else if (days < 0 && days >= -3) {
      notes.push({
        id: `past-${event.id}`,
        type: 'past',
        title: `Terminó hace ${Math.abs(days)}d`,
        body: event.name,
        href: `/events/${event.id}`,
        icon: CheckCircleIcon,
        color: 'text-zinc-500',
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

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: events = [] } = useSWR<Event[]>(
    '/events/all',
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const notifications = buildNotifications(events)
  const count = notifications.filter((n) => n.type !== 'past').length

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
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label="Notificaciones"
      >
        <BellIcon className="size-5" />
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white"
          >
            {count > 9 ? '9+' : count}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/40 z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="text-sm font-semibold text-zinc-200">Notificaciones</p>
              {count > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                  {count} activa{count !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <BellIcon className="mx-auto size-7 text-zinc-700 mb-2" />
                  <p className="text-sm text-zinc-600">Sin notificaciones activas</p>
                  <p className="text-xs text-zinc-700 mt-1">
                    Te avisamos cuando un evento esté próximo.
                  </p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = n.icon
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                    >
                      <div className={`mt-0.5 shrink-0 ${n.color}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${n.color}`}>{n.title}</p>
                        <p className="text-sm text-zinc-300 truncate mt-0.5">{n.body}</p>
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
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Ver todos los eventos →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
