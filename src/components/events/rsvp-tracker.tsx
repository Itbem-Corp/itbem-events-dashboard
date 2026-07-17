'use client'

import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageDataError } from '@/components/ui/page-data-error'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { eventGuestsExportPath, eventGuestsPagePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  getEffectiveStatus,
  getGuestCompanionCount,
  getGuestRsvpAt,
  getGuestRsvpMethod,
} from '@/lib/guest-utils'
import { getGuestRsvpUrl, hasGuestRsvpToken } from '@/lib/public-urls'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'
import type { GuestSummary } from '@/models/GuestSummary'
import {
  ArrowDownTrayIcon,
  ClipboardDocumentCheckIcon,
  EnvelopeIcon,
  FunnelIcon,
  GlobeAltIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PhoneArrowUpRightIcon,
  UsersIcon as UsersIconSolid,
} from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR, { preload } from 'swr'

// ─── Constants ─────────────────────────────────────────────────────────────────

type FilterId = 'ALL' | 'CONFIRMED' | 'PENDING' | 'DECLINED'

const FILTERS: { id: FilterId; label: string; color: string }[] = [
  { id: 'ALL', label: 'Todos', color: '' },
  { id: 'CONFIRMED', label: 'Confirmados', color: 'text-lime-400' },
  { id: 'PENDING', label: 'Pendientes', color: 'text-amber-400' },
  { id: 'DECLINED', label: 'Declinados', color: 'text-pink-400' },
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KPIRing({
  value,
  max,
  color,
  label,
  accent,
}: {
  value: number
  max: number
  color: string
  label: string
  accent: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4">
      <div className="relative size-12 shrink-0">
        <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
          <circle cx="24" cy="24" r={radius} fill="none" stroke="#27272a" strokeWidth="4" />
          <motion.circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink-secondary">
          {pct}%
        </span>
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        <p className="text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  )
}

function MethodBadge({ method }: { method?: string }) {
  if (!method) return null
  const m = method.toLowerCase()
  if (m === 'web')
    return (
      <span
        title="Respondió desde la página web"
        className="inline-flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400"
      >
        <GlobeAltIcon className="size-2.5" /> Web
      </span>
    )
  if (m === 'app')
    return (
      <span
        title="Respondió desde la app"
        className="inline-flex items-center gap-1 rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
      >
        <PhoneArrowUpRightIcon className="size-2.5" /> App
      </span>
    )
  if (m === 'host')
    return (
      <span
        title="Confirmado manualmente por el organizador"
        className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
      >
        <UsersIconSolid className="size-2.5" /> Host
      </span>
    )
  return <span className="text-[10px] text-ink-muted">{method}</span>
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
              className={['size-2.5 rounded-full transition-colors', step.done ? 'bg-lime-400' : 'bg-surface-soft'].join(
                ' '
              )}
            />
            {step.date && (
              <span className="mt-0.5 text-[9px] whitespace-nowrap text-ink-muted">{formatRelative(step.date)}</span>
            )}
            {!step.date && <span className="mt-0.5 text-[9px] text-ink-muted">—</span>}
          </div>
          {i < steps.length - 1 && (
            <div
              className={['mx-1 mt-[-10px] h-px w-6 sm:w-8', steps[i + 1].done ? 'bg-lime-400/50' : 'bg-surface-soft'].join(
                ' '
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function PlusOneBadge({ count }: { count: number }) {
  if (count <= 0) return <span className="text-xs text-ink-muted">—</span>
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400">
      +{count}
    </span>
  )
}

// ─── CSV Export ─────────────────────────────────────────────────────────────────

// ─── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  eventIdentifier: string
  summary: GuestSummary | null
}

const RSVP_PAGE_SIZE = 50
const EMPTY_SUMMARY: GuestSummary = { total: 0, confirmed: 0, pending: 0, declined: 0, total_attendees: 0 }

export function RSVPTracker({ eventId, eventIdentifier, summary }: Props) {
  const [filter, setFilter] = useState<FilterId>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exportingCSV, setExportingCSV] = useState(false)
  const debouncedSearch = useDebounce(search, 200)
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const effectiveSummary = summary ?? EMPTY_SUMMARY
  const guestsKey = eventGuestsPagePath(eventId, {
    page,
    page_size: RSVP_PAGE_SIZE,
    search: debouncedSearch,
    filter,
    sort: 'name',
    direction: 'asc',
  })
  const {
    data: rawGuests,
    error,
    isLoading,
    isValidating,
    mutate: retryGuests,
  } = useSWR<CheckinGuestsPageResponse>(guestsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const guestsPage = useMemo(() => readApiData<CheckinGuestsPageResponse | undefined>(rawGuests), [rawGuests])
  const visibleGuests = useMemo(() => guestsPage?.data ?? [], [guestsPage])
  const filteredTotal = guestsPage?.total ?? 0
  const errorState = getDataErrorState(error, rawGuests)
  const isSearchPending = debouncedSearch !== search || isValidating

  const total = summary?.total ?? filteredTotal
  const confirmedCount = effectiveSummary.confirmed
  const declinedCount = effectiveSummary.declined
  const pendingCount = effectiveSummary.pending
  const responded = confirmedCount + declinedCount
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
  const estimatedAttendees = effectiveSummary.total_attendees
  const totalPlusOnes = Math.max(0, estimatedAttendees - confirmedCount)

  const exportRsvpCSV = useCallback(async () => {
    if (filteredTotal === 0 || exportingCSV) return
    setExportingCSV(true)
    try {
      const response = await api.get<Blob>(
        eventGuestsExportPath(eventId, {
          search: debouncedSearch,
          filter,
          sort: 'name',
          direction: 'asc',
          view: 'rsvp',
        }),
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `rsvp-${eventIdentifier}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(`${filteredTotal} respuesta${filteredTotal !== 1 ? 's' : ''} RSVP exportada${filteredTotal !== 1 ? 's' : ''}`)
    } catch (error) {
      toast.error('No pudimos exportar las respuestas RSVP')
    } finally {
      setExportingCSV(false)
    }
  }, [debouncedSearch, eventId, eventIdentifier, exportingCSV, filter, filteredTotal])

  const firstPendingWithToken = useMemo(
    () =>
      visibleGuests.find((guest) => getEffectiveStatus(guest) === 'PENDING' && hasGuestRsvpToken(guest)) ??
      visibleGuests.find(hasGuestRsvpToken),
    [visibleGuests]
  )

  useEffect(() => {
    const pageCount = Math.ceil(filteredTotal / RSVP_PAGE_SIZE)
    if (page >= pageCount) return
    const nextPath = eventGuestsPagePath(eventId, {
      page: page + 1,
      page_size: RSVP_PAGE_SIZE,
      search: debouncedSearch,
      filter,
      sort: 'name',
      direction: 'asc',
    })
    void Promise.resolve(preload(nextPath, fetcher)).catch(() => undefined)
  }, [debouncedSearch, eventId, filter, filteredTotal, page])

  // ── Actions ────────────────────────────────────────────────────────────────

  const copyRsvpLink = useCallback(async () => {
    if (!firstPendingWithToken) {
      toast.error('No hay enlaces RSVP personales disponibles')
      return
    }
    const url = getGuestRsvpUrl(firstPendingWithToken, eventIdentifier)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link RSVP de ${firstPendingWithToken.first_name} copiado`)
    } catch {
      toast.error('No se pudo copiar el link RSVP')
    }
  }, [eventIdentifier, firstPendingWithToken])

  // ── Loading / Empty ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-raised" />
          ))}
        </div>
        <div className="h-6 rounded-full bg-surface-raised" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-raised/50" />
        ))}
      </div>
    )
  }

  if (errorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar RSVP"
        description="La lista de respuestas no está disponible en este momento."
        onRetry={() => void retryGuests()}
        retrying={isValidating}
      />
    )
  }

  if (total === 0 && rawGuests) {
    return (
      <EmptyState
        icon={EnvelopeIcon}
        title="Sin invitaciones"
        description="Las invitaciones aparecerán aquí cuando agregues invitados al evento."
      />
    )
  }

  // ── Segment widths ─────────────────────────────────────────────────────────

  const confirmedPct = total > 0 ? (confirmedCount / total) * 100 : 0
  const declinedPct = total > 0 ? (declinedCount / total) * 100 : 0
  const pendingPct = total > 0 ? (pendingCount / total) * 100 : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPIRing value={responded} max={total} color="#818cf8" label="Tasa respuesta" accent="text-white" />
        <KPIRing value={confirmedCount} max={total} color="#84cc16" label="Confirmados" accent="text-lime-400" />
        <KPIRing value={declinedCount} max={total} color="#ec4899" label="Declinados" accent="text-pink-400" />
        <KPIRing value={pendingCount} max={total} color="#f59e0b" label="Pendientes" accent="text-amber-400" />
      </div>

      {/* ── Segmented Progress Bar ────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-secondary">Progreso de respuestas</span>
          <span className="font-semibold text-ink tabular-nums">
            {responded} / {total}
          </span>
        </div>

        <div className="flex h-3 overflow-hidden rounded-full bg-surface-raised">
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

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-lime-500" />
            {confirmedCount} confirmados ({Math.round(confirmedPct)}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-pink-500" />
            {declinedCount} declinados ({Math.round(declinedPct)}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500/40" />
            {pendingCount} pendientes ({Math.round(pendingPct)}%)
          </span>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Filter tabs */}
        <div className="flex w-full overflow-hidden rounded-lg border border-white/10 sm:w-auto">
          {FILTERS.map((f) => {
            const count =
              f.id === 'ALL'
                ? total
                : f.id === 'CONFIRMED'
                  ? confirmedCount
                  : f.id === 'DECLINED'
                    ? declinedCount
                    : pendingCount
            return (
              <button
                key={f.id}
                onClick={() => {
                  setFilter(f.id)
                  setPage(1)
                }}
                className={[
                  'flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors sm:flex-initial sm:gap-1.5 sm:px-3 sm:py-1.5',
                  filter === f.id ? 'bg-indigo-600 text-white' : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                ].join(' ')}
              >
                <FunnelIcon className="hidden size-3 sm:block" />
                {f.label}
                <span
                  className={[
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    filter === f.id ? 'bg-white/20' : 'bg-surface-raised text-ink-muted',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              placeholder="Buscar por nombre, email o teléfono…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              aria-busy={isSearchPending}
              className="w-full rounded-lg border border-white/10 bg-surface py-2 pr-3 pl-8 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:py-1.5"
            />
          </div>

          <button
            onClick={copyRsvpLink}
            disabled={!firstPendingWithToken}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
            title="Copiar primer link RSVP pendiente"
          >
            <LinkIcon className="size-3.5" />
            <span className="hidden sm:inline">Copiar RSVP</span>
          </button>

          <button
            onClick={() => void exportRsvpCSV()}
            disabled={exportingCSV || filteredTotal === 0}
            aria-label="CSV completo"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
            title="Exportar RSVP a CSV"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            <span className="sr-only sm:not-sr-only">{exportingCSV ? 'Exportando…' : 'CSV completo'}</span>
          </button>
        </div>

        {/* Result count */}
        <p className="text-xs text-ink-muted">
          {filteredTotal === total ? `${total} invitados` : `${filteredTotal} de ${total} invitados`}
        </p>
      </div>

      {errorState === 'stale' && (
        <StaleDataNotice label="las respuestas RSVP" onRetry={() => void retryGuests()} retrying={isValidating} />
      )}

      {/* ── Mobile cards ──────────────────────────────────────────────────── */}
      {!isDesktop ? (
        <div data-rsvp-layout="mobile" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {visibleGuests.map((guest) => {
              const status = getEffectiveStatus(guest)
              const respondedAt = getGuestRsvpAt(guest) ?? (status !== 'PENDING' ? guest.updated_at : undefined)
              const plusOnes = getGuestCompanionCount(guest)
              const rsvpMethod = getGuestRsvpMethod(guest)

              return (
                <motion.div
                  key={guest.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-3 rounded-xl border border-white/10 bg-surface/50 p-3.5"
                >
                  {/* Row 1: Name + Plus ones */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {guest.first_name} {guest.last_name}
                      </p>
                      {guest.email && <p className="mt-0.5 truncate text-xs text-ink-muted">{guest.email}</p>}
                      {guest.phone && !guest.email && (
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{guest.phone}</p>
                      )}
                    </div>
                    <PlusOneBadge count={plusOnes} />
                  </div>

                  {/* Row 2: Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GuestStatusBadge code={status} />
                    <MethodBadge method={rsvpMethod} />
                  </div>

                  {/* Row 3: Progress stepper with dates */}
                  <div className="flex items-center justify-between">
                    <ProgressStepper createdAt={guest.created_at} respondedAt={respondedAt} />
                    {respondedAt && (
                      <span className="text-[10px] text-ink-muted tabular-nums">{formatDateTime(respondedAt)}</span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div data-rsvp-layout="desktop" className="overflow-x-auto rounded-xl border border-white/10">
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
                {visibleGuests.map((guest) => {
                  const status = getEffectiveStatus(guest)
                  const respondedAt = getGuestRsvpAt(guest) ?? (status !== 'PENDING' ? guest.updated_at : undefined)
                  const plusOnes = getGuestCompanionCount(guest)
                  const rsvpMethod = getGuestRsvpMethod(guest)

                  return (
                    <TableRow key={guest.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <span className="font-medium text-ink">
                            {guest.first_name} {guest.last_name}
                          </span>
                          {guest.email && (
                            <p className="mt-0.5 max-w-[200px] truncate text-xs text-ink-muted">{guest.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <GuestStatusBadge code={status} />
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={rsvpMethod} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PlusOneBadge count={plusOnes} />
                      </TableCell>
                      <TableCell>
                        {respondedAt ? (
                          <div>
                            <p className="text-xs text-ink-secondary tabular-nums">{formatDate(respondedAt)}</p>
                            <p className="text-[10px] text-ink-muted">{formatRelative(respondedAt)}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">Sin respuesta</span>
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
      )}

      <Pagination total={filteredTotal} page={page} pageSize={RSVP_PAGE_SIZE} onPageChange={setPage} />

      {/* ── Summary Footer ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <ClipboardDocumentCheckIcon className="size-3.5 text-ink-muted" />
            <strong className="text-ink-secondary">{total}</strong> invitados totales
          </span>
          <span>
            <strong className="text-lime-400">{totalPlusOnes}</strong> acompañantes confirmados
          </span>
          <span>
            <strong className="text-indigo-400">{estimatedAttendees}</strong> asistentes estimados
          </span>
        </div>
        <div className="text-xs text-ink-muted tabular-nums">{responseRate}% respondieron</div>
      </div>
    </div>
  )
}
