'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  LinkIcon,
  FunnelIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/20/solid'
import { toast } from 'sonner'
import { getEffectiveStatus, exportCSV } from '@/lib/guest-utils'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'

type FilterId = 'ALL' | 'CONFIRMED' | 'PENDING' | 'DECLINED'

const FILTERS: { id: FilterId; label: string; color: string }[] = [
  { id: 'ALL',       label: 'Todos',       color: '' },
  { id: 'CONFIRMED', label: 'Confirmados', color: 'text-lime-400' },
  { id: 'PENDING',   label: 'Pendientes',  color: 'text-amber-400' },
  { id: 'DECLINED',  label: 'Declinados',  color: 'text-pink-400' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays}d`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)}sem`
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KPIRing({ value, max, color, label, accent }: {
  value: number; max: number; color: string; label: string; accent: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
      <div className="relative size-12 shrink-0">
        <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="#27272a" strokeWidth="4" />
          <motion.circle
            cx="24" cy="24" r={radius} fill="none"
            stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-300">
          {pct}%
        </span>
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  )
}

function MethodBadge({ method }: { method?: string }) {
  if (!method) return null
  const m = method.toLowerCase()
  if (m === 'web') return (
    <span title="Respondió desde la página web" className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">
      <GlobeAltIcon className="size-2.5" /> Web
    </span>
  )
  if (m === 'app') return (
    <span title="Respondió desde la app" className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5">
      <PhoneArrowUpRightIcon className="size-2.5" /> App
    </span>
  )
  if (m === 'host') return (
    <span title="Confirmado manualmente por el organizador" className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
      <UsersIconSolid className="size-2.5" /> Host
    </span>
  )
  return <span className="text-[10px] text-zinc-600">{method}</span>
}

function ProgressStepper({ createdAt, respondedAt }: { createdAt: string; respondedAt?: string }) {
  const steps = [
    { label: 'Agregado', done: true, date: createdAt },
    { label: 'Respondió', done: Boolean(respondedAt), date: respondedAt },
  ]

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={[
                'size-2.5 rounded-full transition-colors',
                step.done ? 'bg-lime-400' : 'bg-zinc-700',
              ].join(' ')}
            />
            {step.date && (
              <span className="text-[9px] text-zinc-600 mt-0.5 whitespace-nowrap">
                {formatRelative(step.date)}
              </span>
            )}
            {!step.date && (
              <span className="text-[9px] text-zinc-700 mt-0.5">—</span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={[
              'w-6 sm:w-8 h-px mx-1 mt-[-10px]',
              steps[i + 1].done ? 'bg-lime-400/50' : 'bg-zinc-700',
            ].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}

function PlusOneBadge({ count }: { count: number }) {
  if (count <= 0) return <span className="text-xs text-zinc-700">—</span>
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
      +{count}
    </span>
  )
}

// ─── CSV Export ─────────────────────────────────────────────────────────────────

function exportRsvpCSV(guests: Guest[], eventIdentifier: string) {
  const headers = ['Nombre', 'Email', 'Teléfono', 'Estado', 'Canal', '+1s', 'Respondió', 'Agregado']
  const rows = guests.map(g => {
    const status = getEffectiveStatus(g)
    const respondedAt = g.rsvp_at ?? (status !== 'PENDING' ? g.updated_at : '')
    return [
      `${g.first_name} ${g.last_name}`,
      g.email ?? '',
      g.phone ?? '',
      status,
      g.rsvp_method ?? '',
      String(g.rsvp_guest_count ?? g.guests_count ?? 0),
      respondedAt ? formatDate(respondedAt) : '',
      formatDate(g.created_at),
    ]
  })
  exportCSV(headers, rows, `rsvp-${eventIdentifier}.csv`)
  toast.success('CSV exportado')
}

// ─── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  eventIdentifier: string
  guests: Guest[]
  isLoading: boolean
}

export function RSVPTracker({ eventIdentifier, guests, isLoading }: Props) {
  const [filter, setFilter] = useState<FilterId>('ALL')
  const [search, setSearch] = useState('')

  // ── Unified status counts ──────────────────────────────────────────────────

  const confirmed = useMemo(() => guests.filter(g => getEffectiveStatus(g) === 'CONFIRMED'), [guests])
  const declined  = useMemo(() => guests.filter(g => getEffectiveStatus(g) === 'DECLINED'), [guests])
  const pending   = useMemo(() => guests.filter(g => getEffectiveStatus(g) === 'PENDING'), [guests])
  const responded = confirmed.length + declined.length
  const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0

  const totalPlusOnes = useMemo(
    () => confirmed.reduce((sum, g) => sum + (g.rsvp_guest_count ?? g.guests_count ?? 0), 0),
    [confirmed],
  )
  const estimatedAttendees = confirmed.length + totalPlusOnes

  // ── Filtered & sorted ──────────────────────────────────────────────────────

  const filteredGuests = useMemo(() => {
    let list = guests

    if (filter !== 'ALL') {
      list = list.filter(g => getEffectiveStatus(g) === filter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
        (g.email ?? '').toLowerCase().includes(q) ||
        (g.phone ?? '').toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      // Pending first, then by response date desc, then created_at desc
      const aStatus = getEffectiveStatus(a) === 'PENDING' ? 0 : 1
      const bStatus = getEffectiveStatus(b) === 'PENDING' ? 0 : 1
      if (aStatus !== bStatus) return aStatus - bStatus
      const aDate = a.rsvp_at ?? a.updated_at ?? a.created_at
      const bDate = b.rsvp_at ?? b.updated_at ?? b.created_at
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
  }, [guests, filter, search])

  // ── Actions ────────────────────────────────────────────────────────────────

  const copyRsvpLink = useCallback(async () => {
    const url = `${PUBLIC_FRONTEND_URL}/rsvp/${eventIdentifier}`
    await navigator.clipboard.writeText(url)
    toast.success('Link RSVP copiado')
  }, [eventIdentifier])

  // ── Loading / Empty ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-zinc-800" />)}
        </div>
        <div className="h-6 rounded-full bg-zinc-800" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-zinc-800/50" />)}
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

  // ── Segment widths ─────────────────────────────────────────────────────────

  const total = guests.length
  const confirmedPct = total > 0 ? (confirmed.length / total) * 100 : 0
  const declinedPct  = total > 0 ? (declined.length / total) * 100 : 0
  const pendingPct   = total > 0 ? (pending.length / total) * 100 : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIRing value={responded}         max={total}     color="#818cf8" label="Tasa respuesta" accent="text-white" />
        <KPIRing value={confirmed.length}  max={total}     color="#84cc16" label="Confirmados"    accent="text-lime-400" />
        <KPIRing value={declined.length}   max={total}     color="#ec4899" label="Declinados"     accent="text-pink-400" />
        <KPIRing value={pending.length}    max={total}     color="#f59e0b" label="Pendientes"     accent="text-amber-400" />
      </div>

      {/* ── Segmented Progress Bar ────────────────────────────────────────── */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Progreso de respuestas</span>
          <span className="font-semibold text-zinc-200 tabular-nums">{responded} / {total}</span>
        </div>

        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
          {confirmedPct > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${confirmedPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-lime-500"
            />
          )}
          {declinedPct > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${declinedPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
              className="h-full bg-pink-500"
            />
          )}
          {pendingPct > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pendingPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
              className="h-full bg-amber-500/40"
            />
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-lime-500" />
            {confirmed.length} confirmados ({Math.round(confirmedPct)}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-pink-500" />
            {declined.length} declinados ({Math.round(declinedPct)}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500/40" />
            {pending.length} pendientes ({Math.round(pendingPct)}%)
          </span>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Filter tabs */}
        <div className="flex rounded-lg overflow-hidden border border-white/10 w-full sm:w-auto">
          {FILTERS.map((f) => {
            const count = f.id === 'ALL' ? total :
              f.id === 'CONFIRMED' ? confirmed.length :
              f.id === 'DECLINED' ? declined.length : pending.length
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={[
                  'flex flex-1 sm:flex-initial items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors',
                  filter === f.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                ].join(' ')}
              >
                <FunnelIcon className="size-3 hidden sm:block" />
                {f.label}
                <span className={[
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  filter === f.id ? 'bg-white/20' : 'bg-zinc-800 text-zinc-500',
                ].join(' ')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-600" />
            <input
              type="search"
              placeholder="Buscar por nombre, email o teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900 pl-8 pr-3 py-2 sm:py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={copyRsvpLink}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 sm:py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Copiar link RSVP del evento"
          >
            <LinkIcon className="size-3.5" />
            <span className="hidden sm:inline">Copiar link</span>
          </button>

          <button
            onClick={() => exportRsvpCSV(filteredGuests, eventIdentifier)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 sm:py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Exportar RSVP a CSV"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>

        {/* Result count */}
        <p className="text-xs text-zinc-600">
          {filteredGuests.length === total
            ? `${total} invitados`
            : `${filteredGuests.length} de ${total} invitados`}
        </p>
      </div>

      {/* ── Mobile cards ──────────────────────────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredGuests.map((guest) => {
            const status = getEffectiveStatus(guest)
            const respondedAt = guest.rsvp_at ?? (status !== 'PENDING' ? guest.updated_at : undefined)
            const plusOnes = guest.rsvp_guest_count ?? guest.guests_count ?? 0

            return (
              <motion.div
                key={guest.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-xl border border-white/10 bg-zinc-900/50 p-3.5 space-y-3"
              >
                {/* Row 1: Name + Plus ones */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {guest.first_name} {guest.last_name}
                    </p>
                    {guest.email && <p className="text-xs text-zinc-600 truncate mt-0.5">{guest.email}</p>}
                    {guest.phone && !guest.email && <p className="text-xs text-zinc-600 truncate mt-0.5">{guest.phone}</p>}
                  </div>
                  <PlusOneBadge count={plusOnes} />
                </div>

                {/* Row 2: Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <GuestStatusBadge code={status} status={guest.status} />
                  <MethodBadge method={guest.rsvp_method} />
                </div>

                {/* Row 3: Progress stepper with dates */}
                <div className="flex items-center justify-between">
                  <ProgressStepper createdAt={guest.created_at} respondedAt={respondedAt} />
                  {respondedAt && (
                    <span className="text-[10px] text-zinc-600 tabular-nums">{formatDateTime(respondedAt)}</span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* ── Desktop table ─────────────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Invitado</TableHeader>
              <TableHeader>Estado</TableHeader>
              <TableHeader>Canal</TableHeader>
              <TableHeader className="text-center">+1s</TableHeader>
              <TableHeader>Respondió</TableHeader>
              <TableHeader>Progreso</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {filteredGuests.map((guest) => {
                const status = getEffectiveStatus(guest)
                const respondedAt = guest.rsvp_at ?? (status !== 'PENDING' ? guest.updated_at : undefined)
                const plusOnes = guest.rsvp_guest_count ?? guest.guests_count ?? 0

                return (
                  <TableRow key={guest.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <span className="text-zinc-100 font-medium">{guest.first_name} {guest.last_name}</span>
                        {guest.email && <p className="text-xs text-zinc-600 mt-0.5 truncate max-w-[200px]">{guest.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <GuestStatusBadge code={status} status={guest.status} />
                    </TableCell>
                    <TableCell>
                      <MethodBadge method={guest.rsvp_method} />
                    </TableCell>
                    <TableCell className="text-center">
                      <PlusOneBadge count={plusOnes} />
                    </TableCell>
                    <TableCell>
                      {respondedAt ? (
                        <div>
                          <p className="text-xs text-zinc-300 tabular-nums">{formatDate(respondedAt)}</p>
                          <p className="text-[10px] text-zinc-600">{formatRelative(respondedAt)}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-700">Sin respuesta</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProgressStepper createdAt={guest.created_at} respondedAt={respondedAt} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {/* ── Summary Footer ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <ClipboardDocumentCheckIcon className="size-3.5 text-zinc-600" />
            <strong className="text-zinc-300">{total}</strong> invitados totales
          </span>
          <span>
            <strong className="text-lime-400">{totalPlusOnes}</strong> acompañantes confirmados
          </span>
          <span>
            <strong className="text-indigo-400">{estimatedAttendees}</strong> asistentes estimados
          </span>
        </div>
        <div className="text-xs text-zinc-600 tabular-nums">
          {responseRate}% respondieron
        </div>
      </div>
    </div>
  )
}
