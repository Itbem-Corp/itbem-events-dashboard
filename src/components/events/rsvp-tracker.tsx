'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion } from 'motion/react'
import type { Invitation } from '@/models/Invitation'
import type { Guest } from '@/models/Guest'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table'
import {
  EnvelopeIcon,
  GlobeAltIcon,
  PhoneArrowUpRightIcon,
  UsersIcon as UsersIconSolid,
} from '@heroicons/react/20/solid'

// Invitation status indicators
function InvitationStatusDot({
  sentAt,
  openedAt,
  respondedAt,
}: {
  sentAt?: string
  openedAt?: string
  respondedAt?: string
}) {
  const steps = [
    { label: 'Enviada', done: Boolean(sentAt), date: sentAt },
    { label: 'Abierta', done: Boolean(openedAt), date: openedAt },
    { label: 'Respondida', done: Boolean(respondedAt), date: respondedAt },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1.5">
          <div
            className={[
              'size-2 rounded-full',
              step.done ? 'bg-lime-400' : 'bg-zinc-700',
            ].join(' ')}
            title={step.label + (step.date ? ` · ${new Date(step.date).toLocaleDateString('es-MX')}` : '')}
          />
          {i < steps.length - 1 && (
            <div className={['w-4 h-px', steps[i + 1].done ? 'bg-lime-400/50' : 'bg-zinc-700'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

interface RSVPRowProps {
  guest: Guest
}

function MethodBadge({ method }: { method?: string }) {
  if (!method) return null
  const m = method.toLowerCase()
  if (m === 'web') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">
      <GlobeAltIcon className="size-2.5" /> Web
    </span>
  )
  if (m === 'app') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5">
      <PhoneArrowUpRightIcon className="size-2.5" /> App
    </span>
  )
  if (m === 'host') return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
      <UsersIconSolid className="size-2.5" /> Host
    </span>
  )
  return <span className="text-[10px] text-zinc-600">{method}</span>
}

function RSVPRow({ guest }: RSVPRowProps) {
  // Use rsvp_at if available, else fallback to updated_at for responded guests
  const respondedAt = guest.rsvp_at ??
    (guest.status?.code !== 'PENDING' ? guest.updated_at : undefined)
  const rsvpGuestCount = guest.rsvp_guest_count ?? guest.guests_count ?? 1

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="text-zinc-100">
          {guest.first_name} {guest.last_name}
        </span>
        {guest.email && (
          <p className="text-xs text-zinc-600 mt-0.5">{guest.email}</p>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 flex-wrap">
          <GuestStatusBadge status={guest.status} />
          <MethodBadge method={guest.rsvp_method} />
        </div>
      </TableCell>
      <TableCell className="text-zinc-400 tabular-nums">
        {rsvpGuestCount}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <InvitationStatusDot
            sentAt={guest.created_at}
            openedAt={undefined}
            respondedAt={respondedAt}
          />
          <span className="text-xs text-zinc-600">
            {respondedAt ? formatRelativeDate(respondedAt) : 'Pendiente'}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-zinc-500 text-xs">
        {formatRelativeDate(guest.created_at)}
      </TableCell>
    </TableRow>
  )
}

interface Props {
  eventIdentifier: string
  guests: Guest[]
  isLoading: boolean
}

export function RSVPTracker({ eventIdentifier, guests, isLoading }: Props) {
  const confirmed = guests.filter((g) => g.status?.code === 'CONFIRMED')
  const pending = guests.filter((g) => g.status?.code === 'PENDING')
  const declined = guests.filter((g) => g.status?.code === 'DECLINED')
  const responseRate =
    guests.length > 0
      ? Math.round(((confirmed.length + declined.length) / guests.length) * 100)
      : 0

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-zinc-800/50 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (guests.length === 0) {
    return (
      <EmptyState
        icon={EnvelopeIcon}
        title="Sin invitaciones"
        description="Las invitaciones aparecerán aquí cuando agregues invitados al evento."
      />
    )
  }

  // Sort: pending first, then by creation date
  const sortedGuests = [...guests].sort((a, b) => {
    const aIsPending = a.status?.code === 'PENDING' ? 1 : 0
    const bIsPending = b.status?.code === 'PENDING' ? 1 : 0
    if (aIsPending !== bIsPending) return bIsPending - aIsPending
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="space-y-6">
      {/* Response rate bar */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-zinc-400">Tasa de respuesta</span>
          <span className="font-semibold tabular-nums">{responseRate}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${responseRate}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
          />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-zinc-500">
          <span>
            <span className="font-medium text-lime-400">{confirmed.length}</span> confirmados
          </span>
          <span>
            <span className="font-medium text-amber-400">{pending.length}</span> pendientes
          </span>
          <span>
            <span className="font-medium text-pink-400">{declined.length}</span> declinados
          </span>
        </div>
      </div>

      {/* Guest RSVP table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Invitado</TableHeader>
              <TableHeader>Estado RSVP</TableHeader>
              <TableHeader>+1s</TableHeader>
              <TableHeader>Progreso</TableHeader>
              <TableHeader>Agregado</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedGuests.map((guest) => (
              <RSVPRow key={guest.id} guest={guest} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
