'use client'
import useSWR from 'swr'
import { motion } from 'motion/react'
import { fetcher } from '@/lib/fetcher'

interface EventAnalytics {
  id: string
  event_id: string
  views: number
  moment_comments: number
  moment_uploads: number
  rsvp_confirmed: number
  rsvp_declined: number
  created_at: string
  updated_at: string
}

interface Props {
  eventId: string
}

function StatCard({
  label,
  value,
  color,
  index,
}: {
  label: string
  value: number
  color: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-1"
    >
      <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value ?? 0}</span>
    </motion.div>
  )
}

export function EventAnalyticsPanel({ eventId }: Props) {
  const { data: analytics, isLoading, error } = useSWR<EventAnalytics>(
    eventId ? `/events/${eventId}/analytics` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 h-24 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-red-400 text-sm p-4">
        Error al cargar analíticas. Intenta recargar la página.
      </p>
    )
  }

  if (!analytics) {
    return (
      <p className="text-zinc-500 text-sm p-4">
        Sin datos de analíticas todavía. Las métricas aparecen en cuanto el evento tenga visitas o RSVPs.
      </p>
    )
  }

  const total = analytics.rsvp_confirmed + analytics.rsvp_declined
  const responseRate = total > 0
    ? Math.round((analytics.rsvp_confirmed / total) * 100)
    : 0

  const stats = [
    { label: 'Vistas', value: analytics.views, color: 'text-sky-400' },
    { label: 'RSVP Confirmados', value: analytics.rsvp_confirmed, color: 'text-lime-400' },
    { label: 'RSVP Declinados', value: analytics.rsvp_declined, color: 'text-pink-400' },
    { label: 'Fotos subidas', value: analytics.moment_uploads, color: 'text-violet-400' },
    { label: 'Mensajes', value: analytics.moment_comments, color: 'text-amber-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} index={i} />
        ))}
      </div>

      {total > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3"
        >
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Tasa de respuesta RSVP</span>
            <span className="text-zinc-200 font-semibold">{responseRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-lime-500"
              initial={{ width: 0 }}
              animate={{ width: `${responseRate}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
            />
          </div>
          <p className="text-xs text-zinc-600">
            {analytics.rsvp_confirmed} confirmados · {analytics.rsvp_declined} declinados · {total} total
          </p>
        </motion.div>
      )}
    </div>
  )
}
