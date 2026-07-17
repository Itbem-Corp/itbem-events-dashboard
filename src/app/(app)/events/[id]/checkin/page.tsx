'use client'

import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePageActivity } from '@/hooks/usePageActivity'
import { api } from '@/lib/api'
import { readApiData, readApiList } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { checkinWorkspacePath, eventCapabilitiesPath, eventCheckinGuestsPath, guestPath } from '@/lib/api-paths'
import type { CheckinGuestFilter } from '@/lib/checkin-guest-index'
import { parseCheckinQrPayload } from '@/lib/checkin-qr'
import { patchCheckinGuestsValue, patchCheckinWorkspaceValue } from '@/lib/checkin-cache'
import { trackProductEvent } from '@/lib/product-analytics'
import { shouldLiveRefreshEvent } from '@/lib/event-live-refresh'
import { fetcher } from '@/lib/fetcher'
import { buildGuestStatusCachePatch, mergeGuestCacheUpdate } from '@/lib/guest-cache'
import {
  buildGuestStatusUpdatePayload,
  findGuestStatusByCode,
  getEffectiveStatus,
  getGuestCompanionCount,
  getGuestTableLabel,
} from '@/lib/guest-utils'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event } from '@/models/Event'
import type { EventCapabilities } from '@/models/EventMember'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import useSWR, { preload } from 'swr'

import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid'
import { QrCodeIcon } from '@heroicons/react/24/outline'

const loadQRScanner = () => import('@/components/events/qr-scanner')
const CHECKIN_PAGE_SIZE = 60

interface CheckinWorkspace {
  event: Event
  statuses: GuestStatus[]
  guests: CheckinGuestsPageResponse
}

const QRScanner = dynamic(() => loadQRScanner().then((module) => module.QRScanner), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-sm text-ink-secondary">
      Preparando cámara…
    </div>
  ),
})

function preloadCheckinScanner() {
  void loadQRScanner()
    .then((module) => module.preloadQRScannerEngine())
    .catch(() => undefined)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusInfo(code?: string) {
  switch (code?.toUpperCase()) {
    case 'CONFIRMED':
      return {
        label: 'Confirmado',
        color: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
        dot: 'bg-lime-400',
        icon: CheckCircleIcon,
      }
    case 'DECLINED':
      return {
        label: 'Declinado',
        color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
        dot: 'bg-pink-400',
        icon: XCircleIcon,
      }
    default:
      return {
        label: 'Pendiente',
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        dot: 'bg-amber-400',
        icon: ClockIcon,
      }
  }
}

// ─── Guest Check-in Card ──────────────────────────────────────────────────────

interface GuestCheckinCardProps {
  guest: Guest
  confirmedStatus?: GuestStatus
  pendingStatus?: GuestStatus
  isOnline: boolean
  patchCaches: (previousGuest: Guest, nextGuest: Guest) => Promise<void>
  revalidateCaches: () => void
}

function GuestCheckinCard({ guest, confirmedStatus, pendingStatus, isOnline, patchCaches, revalidateCaches }: GuestCheckinCardProps) {
  const [loading, setLoading] = useState(false)
  const attendanceCode = getEffectiveStatus(guest)
  const status = getStatusInfo(attendanceCode)
  const StatusIcon = status.icon
  const isConfirmed = attendanceCode === 'CONFIRMED'
  const companionCount = getGuestCompanionCount(guest)

  const updateStatus = async (status?: GuestStatus) => {
    if (loading || !status || !isOnline) return
    setLoading(true)
    const payload = buildGuestStatusUpdatePayload(status)
    const optimisticGuest = { ...guest, ...buildGuestStatusCachePatch(status, payload) }
    await patchCaches(guest, optimisticGuest)

    try {
      const res = await api.put(guestPath(guest.id), payload)
      const updatedGuest = readApiData<Guest | null>(res.data)
      const cacheGuest = mergeGuestCacheUpdate(updatedGuest, optimisticGuest)
      await patchCaches(optimisticGuest, cacheGuest)
      if (!updatedGuest?.id) revalidateCaches()
      if (status.code.trim().toUpperCase() === 'CONFIRMED') {
        trackProductEvent('checkin_completed', { method: 'manual' })
      }
    } catch (err) {
      await patchCaches(optimisticGuest, guest)
      toast.error(getApiErrorMessage(err, 'Error al actualizar'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={[
        'relative flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:gap-4 sm:px-4 sm:py-3.5',
        isConfirmed ? 'border-lime-500/30 bg-lime-500/5' : 'border-white/10 bg-surface/60 hover:border-white/20',
      ].join(' ')}
    >
      {/* Left: avatar + info */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={[
            'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
            isConfirmed ? 'border-lime-400 text-lime-400' : 'border-border-subtle text-ink-muted',
          ].join(' ')}
        >
          {guest.first_name[0]}
          {guest.last_name[0]}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {guest.first_name} {guest.last_name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {getGuestTableLabel(guest) && <span className="text-xs text-ink-muted">{getGuestTableLabel(guest)}</span>}
            {companionCount > 0 && <span className="text-xs text-ink-muted">+{companionCount} acomp.</span>}
            <span
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${status.color}`}
            >
              <StatusIcon className="size-3" />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex shrink-0 items-center gap-2">
        {!isConfirmed ? (
          <button
            type="button"
            onClick={() => updateStatus(confirmedStatus)}
            disabled={loading || !confirmedStatus || !isOnline}
            aria-label={`Marcar llegada de ${guest.first_name} ${guest.last_name}`}
            title={isOnline ? undefined : 'Sin conexión'}
            className="flex items-center gap-1.5 rounded-lg bg-lime-500 px-4 py-2 text-sm font-bold text-black shadow-lg shadow-lime-500/20 transition-colors hover:bg-lime-400 active:bg-lime-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <ArrowPathIcon className="size-4 animate-spin" /> : <CheckCircleIcon className="size-4" />}
            Llegó
          </button>
        ) : (
          <button
            type="button"
            onClick={() => updateStatus(pendingStatus)}
            disabled={loading || !pendingStatus || !isOnline}
            aria-label={`Desmarcar llegada de ${guest.first_name} ${guest.last_name}`}
            title={isOnline ? undefined : 'Sin conexión'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-raised px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-50"
          >
            {loading ? <ArrowPathIcon className="size-3 animate-spin" /> : <ClockIcon className="size-3" />}
            Desmarcar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const isPageActive = usePageActivity()
  const isOnline = useOnlineStatus()
  const shouldAutoFocusSearch = useMediaQuery('(min-width: 640px)')
  const { id } = useParams<{ id: string }>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CheckinGuestFilter>('ALL')
  const [page, setPage] = useState(1)
  const [showScanner, setShowScanner] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scannerButtonRef = useRef<HTMLButtonElement>(null)
  const debouncedSearch = useDebounce(search, 200)

  const {
    data: capabilities,
    error: capabilitiesError,
    isLoading: capabilitiesLoading,
  } = useSWR<EventCapabilities>(id ? eventCapabilitiesPath(id) : null, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const canRunCheckin = capabilities?.['checkin:run'] === true

  const {
    data: workspace,
    error: workspaceError,
    isLoading: workspaceLoading,
    mutate: retryWorkspace,
  } = useSWR<CheckinWorkspace>(id && canRunCheckin ? checkinWorkspacePath(id) : null, fetcher, responsiveListSwrOptions)

  const event = workspace?.event
  const liveRefreshEnabled = shouldLiveRefreshEvent(Boolean(event?.is_active), event?.event_date_time, event?.timezone)
  const rawGuestStatuses = workspace?.statuses

  const guestsKey = workspace && id
    ? eventCheckinGuestsPath(id, {
        page,
        page_size: CHECKIN_PAGE_SIZE,
        search: debouncedSearch,
        filter,
      })
    : null
  const {
    data: rawGuests,
    isLoading: guestsLoading,
    isValidating: guestsValidating,
    error: guestsError,
    mutate: retryGuests,
  } = useSWR<CheckinGuestsPageResponse>(guestsKey, fetcher, {
    ...responsiveListSwrOptions,
    fallbackData: page === 1 && !debouncedSearch && filter === 'ALL' ? workspace?.guests : undefined,
    revalidateOnMount: !(page === 1 && !debouncedSearch && filter === 'ALL'),
    keepPreviousData: true,
    refreshInterval: isPageActive && liveRefreshEnabled ? 10000 : 0,
  })
  const guestsPage = useMemo(() => readApiData<CheckinGuestsPageResponse | undefined>(rawGuests), [rawGuests])
  const guests = useMemo(() => guestsPage?.data ?? [], [guestsPage])
  const effectiveEventError = workspaceError
  const effectiveStatusesError = workspaceError
  const effectiveGuestsError = workspaceError ?? guestsError
  const guestsErrorState = getDataErrorState(effectiveGuestsError, rawGuests ?? workspace?.guests)
  const initialLoading = workspaceLoading || guestsLoading
  const summary = guestsPage?.summary

  const statuses = useMemo<GuestStatus[]>(() => {
    const catalog = readApiList<GuestStatus>(rawGuestStatuses)
    if (catalog.length > 0) return catalog

    const map = new Map<string, GuestStatus>()
    for (const g of guests) {
      if (g.status?.id && !map.has(g.status.id)) map.set(g.status.id, g.status)
    }
    return Array.from(map.values())
  }, [rawGuestStatuses, guests])

  const confirmedStatus = findGuestStatusByCode(statuses, 'CONFIRMED')
  const pendingStatus = findGuestStatusByCode(statuses, 'PENDING')

  const patchCaches = useCallback(
    async (previousGuest: Guest, nextGuest: Guest) => {
      await Promise.all([
        retryGuests(
          (current) => patchCheckinGuestsValue(current ?? guestsPage, previousGuest, nextGuest) as CheckinGuestsPageResponse,
          { revalidate: false }
        ),
        retryWorkspace(
          (current) => patchCheckinWorkspaceValue(current ?? workspace, previousGuest, nextGuest) as CheckinWorkspace,
          { revalidate: false }
        ),
      ])
    },
    [guestsPage, retryGuests, retryWorkspace, workspace]
  )

  const revalidateCaches = useCallback(() => {
    void retryGuests()
    void retryWorkspace()
  }, [retryGuests, retryWorkspace])

  const totalGuests = summary?.total ?? guestsPage?.total ?? 0
  const resultTotal = guestsPage?.total ?? 0
  const confirmedCount = summary?.confirmed ?? 0
  const pendingCount = summary?.pending ?? Math.max(totalGuests - confirmedCount, 0)
  const checkinRate = totalGuests > 0 ? Math.round((confirmedCount / totalGuests) * 100) : 0

  // Auto-focus search on mount
  useEffect(() => {
    if (shouldAutoFocusSearch) inputRef.current?.focus()
  }, [shouldAutoFocusSearch])

  // Keyboard: Escape to clear search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearch('')
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeScanner = useCallback(() => {
    setShowScanner(false)
    window.requestAnimationFrame(() => scannerButtonRef.current?.focus())
  }, [])

  const preloadCheckinPage = useCallback(
    (nextPage: number) => {
      if (!id) return
      const path = eventCheckinGuestsPath(id, {
        page: nextPage,
        page_size: CHECKIN_PAGE_SIZE,
        search: debouncedSearch,
        filter,
      })
      void Promise.resolve(preload(path, fetcher)).catch(() => undefined)
    },
    [debouncedSearch, filter, id]
  )

  const handleQRScan = useCallback(
    async (raw: string) => {
      closeScanner()
      const payload = parseCheckinQrPayload(raw)
      if (!isOnline) {
        toast.error('Sin conexión. El check-in se reanudará cuando vuelva la red.')
        return
      }
      if (!id || !confirmedStatus || !guestsKey) return

      try {
        const lookup = await api.get(eventCheckinGuestsPath(id, { page: 1, page_size: 1, qr: payload.guestId }))
        const match = readApiData<CheckinGuestsPageResponse | undefined>(lookup.data)?.data?.[0]
        if (!match) {
          toast(
            `QR escaneado: ${payload.guestId.slice(0, 16)}${payload.guestId.length > 16 ? '…' : ''} — no encontrado en lista`
          )
          return
        }
        if (getEffectiveStatus(match) === 'CONFIRMED') {
          toast(`${match.first_name} ${match.last_name} ya estaba registrado`)
          return
        }

        const optimisticGuest = {
          ...match,
          ...buildGuestStatusCachePatch(confirmedStatus, buildGuestStatusUpdatePayload(confirmedStatus)),
        }
        await patchCaches(match, optimisticGuest)
        try {
          const res = await api.put(guestPath(match.id), buildGuestStatusUpdatePayload(confirmedStatus))
          const updatedGuest = readApiData<Guest | null>(res.data)
          const cacheGuest = mergeGuestCacheUpdate(updatedGuest, optimisticGuest)
          await patchCaches(optimisticGuest, cacheGuest)
          if (!updatedGuest?.id) revalidateCaches()
        } catch (err) {
          await patchCaches(optimisticGuest, match)
          throw err
        }
        trackProductEvent('checkin_completed', { method: 'qr' })
        toast.success(`${match.first_name} ${match.last_name} — marcado como llegado`)
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Error al procesar el QR'))
      }
    },
    [closeScanner, confirmedStatus, guestsKey, id, isOnline, patchCaches, revalidateCaches]
  )

  if (capabilitiesLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" />
          <p className="mt-4 text-sm text-ink-muted">Validando acceso a check-in…</p>
        </div>
      </div>
    )
  }

  if (capabilitiesError || !canRunCheckin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas px-6">
        <div className="premium-surface max-w-md rounded-3xl p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] text-amber-300">
            <LockClosedIcon className="size-5" />
          </span>
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-white">Check-in no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Tu rol puede consultar este evento, pero no registrar ni modificar la llegada de invitados.
          </p>
          <Link
            href={`/events/${id}`}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Volver al evento
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas">
      {/* Header bar */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {!isOnline && (
            <div role="status" className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <p className="text-xs font-medium text-amber-300">
                Sin conexión · lista visible disponible, búsqueda y check-in pausados
              </p>
            </div>
          )}
          {effectiveEventError && (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-500/10 px-3 py-2"
            >
              <p className="text-xs text-red-300">No se pudo actualizar la información del evento.</p>
              <button
                type="button"
                onClick={() => void retryWorkspace()}
                className="shrink-0 text-xs font-semibold text-red-200 hover:text-white"
              >
                Reintentar
              </button>
            </div>
          )}
          {effectiveStatusesError && (!confirmedStatus || !pendingStatus) && (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-3 py-2"
            >
              <p className="text-xs text-amber-300">Los controles están pausados mientras recuperamos los estados.</p>
              <button
                type="button"
                onClick={() => void retryWorkspace()}
                className="shrink-0 text-xs font-semibold text-amber-200 hover:text-white"
              >
                Reintentar
              </button>
            </div>
          )}
          <div className="mb-3 flex items-center gap-3">
            <Link
              href={`/events/${id}`}
              className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink-secondary"
            >
              <ChevronLeftIcon className="size-4" />
              Volver
            </Link>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-ink">
                {workspaceLoading ? 'Cargando evento…' : (event?.name ?? 'Check-in')}
              </p>
              <p className="text-xs text-ink-muted">Modo check-in</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink-muted">Llegaron</p>
              <p className="text-sm font-bold text-lime-400">
                {confirmedCount} / {totalGuests}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div
            role="progressbar"
            aria-label="Progreso de check-in"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={checkinRate}
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-raised"
          >
            <div
              className="h-full rounded-full bg-lime-500 transition-[width] duration-500"
              style={{ width: `${checkinRate}%` }}
            />
          </div>

          {/* Filter tabs */}
          <div className="mb-3 flex gap-1">
            {(
              [
                { id: 'ALL', label: 'Todos', count: totalGuests },
                { id: 'PENDING', label: 'Esperados', count: pendingCount },
                { id: 'CONFIRMED', label: 'Llegaron', count: confirmedCount },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id)
                  setPage(1)
                }}
                aria-pressed={filter === tab.id}
                disabled={!isOnline}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === tab.id
                    ? tab.id === 'CONFIRMED'
                      ? 'bg-lime-500/20 text-lime-400'
                      : tab.id === 'PENDING'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-indigo-600 text-white'
                    : 'bg-surface text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {tab.label}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* QR Scanner button — above the search input */}
          <div className="mb-3 flex gap-2">
            <button
              ref={scannerButtonRef}
              type="button"
              onClick={() => setShowScanner(true)}
              onPointerEnter={preloadCheckinScanner}
              onPointerDown={preloadCheckinScanner}
              onFocus={preloadCheckinScanner}
              disabled={!isOnline || !confirmedStatus || initialLoading || guestsErrorState === 'fatal'}
              title={!isOnline ? 'Sin conexión' : !confirmedStatus ? 'Estados de check-in no disponibles' : undefined}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <QrCodeIcon className="size-4" />
              Escanear QR
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref={inputRef}
              type="search"
              aria-label="Buscar invitado por nombre o mesa"
              inputMode="search"
              autoComplete="off"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              disabled={!isOnline}
              title={isOnline ? undefined : 'La búsqueda requiere conexión'}
              placeholder="Buscar por nombre, correo, teléfono o mesa…"
              className="w-full rounded-xl border border-white/10 bg-surface py-3 pr-4 pl-10 text-sm text-ink placeholder-ink-muted focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Guest list */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {guestsErrorState === 'stale' && (
          <div className="mb-4">
            <StaleDataNotice label="invitados" onRetry={() => void retryGuests()} retrying={guestsValidating} />
          </div>
        )}

        {guestsErrorState === 'fatal' ? (
          <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
            <XCircleIcon className="mx-auto size-10 text-red-400" />
            <p className="mt-4 text-sm font-semibold text-ink">No pudimos cargar la lista de invitados</p>
            <p className="mt-1 text-xs text-ink-muted">
              La lista existente no se modificó. Revisa la conexión e intenta de nuevo.
            </p>
            <button
              type="button"
              onClick={() => void retryGuests()}
              disabled={guestsValidating}
              aria-busy={guestsValidating}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
            >
              <ArrowPathIcon
                className={guestsValidating ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
              />
              {guestsValidating ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        ) : initialLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
            ))}
          </div>
        ) : guests.length === 0 ? (
          <div className="py-16 text-center">
            <UserCircleIcon className="mx-auto mb-3 size-12 text-ink-muted" />
            <p className="text-sm text-ink-muted">
              {search ? 'Ningún invitado coincide con la búsqueda.' : 'No hay invitados en esta vista.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-ink-muted">
              {resultTotal} invitado{resultTotal !== 1 ? 's' : ''} · toca &ldquo;Llegó&rdquo; para marcar
            </p>
            {guests.map((guest) => (
              <GuestCheckinCard
                key={guest.id}
                guest={guest}
                confirmedStatus={confirmedStatus}
                pendingStatus={pendingStatus}
                isOnline={isOnline}
                patchCaches={patchCaches}
                revalidateCaches={revalidateCaches}
              />
            ))}
            {isOnline && (
              <Pagination
                total={resultTotal}
                page={page}
                pageSize={CHECKIN_PAGE_SIZE}
                onPageChange={setPage}
                onPageIntent={preloadCheckinPage}
              />
            )}
          </div>
        )}
      </div>

      {/* Floating summary footer */}
      <div className="sticky bottom-0 border-t border-white/10 bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-xs">
          <span className={isOnline ? 'text-ink-muted' : 'font-medium text-amber-400'}>
            {isOnline
              ? liveRefreshEnabled
                ? `${checkinRate}% de asistencia · sincronización cada 10s`
                : `${checkinRate}% de asistencia · evento fuera de ventana en vivo`
              : 'Sin conexión · cambios pausados'}
          </span>
          <div className="flex items-center gap-4">
            <span className="font-semibold text-lime-400">{confirmedCount} llegaron</span>
            <span className="text-amber-400">{pendingCount} esperados</span>
          </div>
        </div>
      </div>

      {showScanner && <QRScanner onScan={handleQRScan} onClose={closeScanner} />}
    </div>
  )
}
