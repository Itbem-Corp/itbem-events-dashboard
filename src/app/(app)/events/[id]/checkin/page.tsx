'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { fetcher } from '@/lib/fetcher'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import Link from 'next/link'

import {
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/20/solid'
import { QRScanner } from '@/components/events/qr-scanner'
import { QrCodeIcon } from '@heroicons/react/24/outline'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusInfo(code?: string) {
  switch (code?.toUpperCase()) {
    case 'CONFIRMED':
      return { label: 'Confirmado', color: 'bg-lime-500/20 text-lime-400 border-lime-500/30', dot: 'bg-lime-400', icon: CheckCircleIcon }
    case 'DECLINED':
      return { label: 'Declinado', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30', dot: 'bg-pink-400', icon: XCircleIcon }
    default:
      return { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-400', icon: ClockIcon }
  }
}

// ─── Guest Check-in Card ──────────────────────────────────────────────────────

interface GuestCheckinCardProps {
  guest: Guest
  eventIdentifier: string
  confirmedStatusId: string
  declinedStatusId: string
  pendingStatusId: string
}

function GuestCheckinCard({ guest, eventIdentifier, confirmedStatusId, declinedStatusId, pendingStatusId }: GuestCheckinCardProps) {
  const [loading, setLoading] = useState(false)
  const status = getStatusInfo(guest.status?.code)
  const StatusIcon = status.icon
  const isConfirmed = guest.status?.code?.toUpperCase() === 'CONFIRMED'

  const updateStatus = async (statusId: string) => {
    if (loading) return
    setLoading(true)
    try {
      await api.put(`/guests/${guest.id}`, { ...guest, status_id: statusId })
      await mutate(`/guests/${eventIdentifier}`)
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className={[
        'relative flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors',
        isConfirmed
          ? 'border-lime-500/30 bg-lime-500/5'
          : 'border-white/10 bg-zinc-900/60 hover:border-white/20',
      ].join(' ')}
    >
      {/* Left: avatar + info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={[
          'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
          isConfirmed ? 'border-lime-400 text-lime-400' : 'border-zinc-700 text-zinc-500',
        ].join(' ')}>
          {guest.first_name[0]}{guest.last_name[0]}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-zinc-100 truncate">
            {guest.first_name} {guest.last_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {guest.table_number && (
              <span className="text-xs text-zinc-500">Mesa {guest.table_number}</span>
            )}
            {guest.guests_count > 1 && (
              <span className="text-xs text-zinc-600">+{guest.guests_count - 1} acomp.</span>
            )}
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
              <StatusIcon className="size-3" />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {!isConfirmed ? (
          <button
            onClick={() => updateStatus(confirmedStatusId)}
            disabled={loading || !confirmedStatusId}
            className="flex items-center gap-1.5 rounded-lg bg-lime-500 px-4 py-2 text-sm font-bold text-black hover:bg-lime-400 active:bg-lime-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-lime-500/20"
          >
            {loading ? <ArrowPathIcon className="size-4 animate-spin" /> : <CheckCircleIcon className="size-4" />}
            Llegó
          </button>
        ) : (
          <button
            onClick={() => updateStatus(pendingStatusId)}
            disabled={loading || !pendingStatusId}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {loading ? <ArrowPathIcon className="size-3 animate-spin" /> : <ClockIcon className="size-3" />}
            Desmarcar
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const { id } = useParams<{ id: string }>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED'>('ALL')
  const [showScanner, setShowScanner] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: event } = useSWR<Event>(
    id ? `/events/${id}` : null,
    fetcher
  )

  const { data: guests = [], isLoading } = useSWR<Guest[]>(
    event?.identifier ? `/guests/${event.identifier}` : null,
    fetcher,
    { refreshInterval: 10000 } // auto-refresh every 10s
  )

  const { data: statuses = [] } = useSWR<GuestStatus[]>(
    '/catalogs/guest-statuses',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const confirmedStatusId = statuses.find((s) => s.code === 'CONFIRMED')?.id ?? ''
  const declinedStatusId = statuses.find((s) => s.code === 'DECLINED')?.id ?? ''
  const pendingStatusId = statuses.find((s) => s.code === 'PENDING')?.id ?? ''

  const confirmed = guests.filter((g) => g.status?.code === 'CONFIRMED')
  const pending = guests.filter((g) => g.status?.code === 'PENDING')
  const checkinRate = guests.length > 0 ? Math.round((confirmed.length / guests.length) * 100) : 0

  const filtered = guests.filter((g) => {
    const matchSearch = !search ||
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      (g.table_number ?? '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'ALL' || g.status?.code === filter
    return matchSearch && matchFilter
  }).sort((a, b) => {
    // Show pending first when looking at all
    if (filter === 'ALL') {
      const aPend = a.status?.code === 'PENDING' ? 0 : 1
      const bPend = b.status?.code === 'PENDING' ? 0 : 1
      if (aPend !== bPend) return aPend - bPend
    }
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
  })

  // Auto-focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard: Escape to clear search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSearch(''); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleQRScan = useCallback(async (token: string) => {
    setShowScanner(false)
    // Find guest whose RSVP token matches — best effort with available data
    // The QR encodes the invitation URL which contains the pretty_token
    // We try to match against any identifiable field
    const match = guests.find(g =>
      g.rsvp_token_id === token ||
      g.email === token ||
      `${g.first_name}-${g.last_name}`.toLowerCase() === token.toLowerCase()
    )
    if (match && confirmedStatusId) {
      try {
        await api.put(`/guests/${match.id}`, { ...match, status_id: confirmedStatusId })
        await mutate(`/guests/${event?.identifier}`)
        toast.success(`${match.first_name} ${match.last_name} — marcado como llegado`)
      } catch {
        toast.error('Error al actualizar el estado')
      }
    } else {
      // Show the token so organizer knows what was scanned
      toast(`QR escaneado: ${token.slice(0, 16)}${token.length > 16 ? '…' : ''} — no encontrado en lista`)
    }
  }, [guests, confirmedStatusId, event?.identifier])

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href={`/events/${id}`}
              className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronLeftIcon className="size-4" />
              Volver
            </Link>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-zinc-200">{event?.name ?? '…'}</p>
              <p className="text-xs text-zinc-600">Modo check-in</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-600">Llegaron</p>
              <p className="text-sm font-bold text-lime-400">{confirmed.length} / {guests.length}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-3">
            <motion.div
              animate={{ width: `${checkinRate}%` }}
              transition={{ duration: 0.5 }}
              className="h-full rounded-full bg-lime-500"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-3">
            {([
              { id: 'ALL', label: 'Todos', count: guests.length },
              { id: 'PENDING', label: 'Esperados', count: pending.length },
              { id: 'CONFIRMED', label: 'Llegaron', count: confirmed.length },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex-1 justify-center',
                  filter === tab.id
                    ? tab.id === 'CONFIRMED' ? 'bg-lime-500/20 text-lime-400'
                      : tab.id === 'PENDING' ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-indigo-600 text-white'
                    : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900',
                ].join(' ')}
              >
                {tab.label}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* QR Scanner button — above the search input */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <QrCodeIcon className="size-4" />
              Escanear QR
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o mesa… (Esc para limpiar)"
              className="w-full rounded-xl border border-white/10 bg-zinc-900 pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
            />
          </div>
        </div>
      </div>

      {/* Guest list */}
      <div className="flex-1 mx-auto w-full max-w-3xl px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 bg-zinc-800/50 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserCircleIcon className="mx-auto size-12 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {search ? 'Ningún invitado coincide con la búsqueda.' : 'No hay invitados en esta vista.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 mb-3">
              {filtered.length} invitado{filtered.length !== 1 ? 's' : ''} · toca &ldquo;Llegó&rdquo; para marcar
            </p>
            <AnimatePresence mode="popLayout">
              {filtered.map((guest) => (
                <GuestCheckinCard
                  key={guest.id}
                  guest={guest}
                  eventIdentifier={event?.identifier ?? ''}
                  confirmedStatusId={confirmedStatusId}
                  declinedStatusId={declinedStatusId}
                  pendingStatusId={pendingStatusId}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Floating summary footer */}
      <div className="sticky bottom-0 border-t border-white/10 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between text-xs">
          <span className="text-zinc-600">
            {checkinRate}% de asistencia · actualiza cada 10s
          </span>
          <div className="flex items-center gap-4">
            <span className="text-lime-400 font-semibold">{confirmed.length} llegaron</span>
            <span className="text-amber-400">{pending.length} esperados</span>
          </div>
        </div>
      </div>

      {showScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
