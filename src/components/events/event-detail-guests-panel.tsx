'use client'

import { Button } from '@/components/button'
import type { EventDetailGuestsViewState, GuestListSortColumn } from '@/components/events/event-detail-guests-state'
import { EventDetailPanelSkeleton } from '@/components/events/event-detail-panel-skeleton'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { GuestStatusSelect } from '@/components/guests/guest-status-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { EmptyState } from '@/components/ui/empty-state'
import { PageDataError } from '@/components/ui/page-data-error'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { api } from '@/lib/api'
import { readApiData, readApiList } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  bulkGuestsPath,
  bulkGuestStatusPath,
  eventGuestsExportPath,
  eventGuestsPagePath,
  guestStatusesPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  buildGuestStatusCachePatch,
  patchGuestsCacheValue,
  removeGuestsCacheValue,
  upsertGuestCacheValue,
} from '@/lib/guest-cache'
import {
  buildGuestStatusUpdatePayload,
  findGuestStatusByCode,
  getEffectiveStatus,
  getGuestCompanionCount,
  getGuestDietaryRestrictions,
  getGuestPartySize,
  getGuestRsvpNotes,
  getGuestTableLabel,
  type GuestStatusCode,
} from '@/lib/guest-utils'
import { getGuestRsvpUrl, hasGuestRsvpToken } from '@/lib/public-urls'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event } from '@/models/Event'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import type { GuestSummary } from '@/models/GuestSummary'
import { ArrowDownTrayIcon, CheckIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/16/solid'
import { MagnifyingGlassIcon, UsersIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import dynamic from 'next/dynamic'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR, { preload } from 'swr'

const GUEST_PAGE_SIZE = 50
const EMPTY_GUEST_SUMMARY: GuestSummary = { total: 0, confirmed: 0, pending: 0, declined: 0, total_attendees: 0 }

const GuestFormModal = dynamic(
  () => import('@/components/guests/forms/guest-form-modal').then((module) => module.GuestFormModal),
  { ssr: false }
)
const GuestDeleteModal = dynamic(
  () => import('@/components/guests/guest-delete-modal').then((module) => module.GuestDeleteModal),
  { ssr: false }
)
const GuestBatchModal = dynamic(
  () => import('@/components/guests/forms/guest-batch-modal').then((module) => module.GuestBatchModal),
  { ssr: false }
)

const preloadGuestFormModal = () => import('@/components/guests/forms/guest-form-modal')
const preloadGuestDeleteModal = () => import('@/components/guests/guest-delete-modal')
const preloadGuestBatchModal = () => import('@/components/guests/forms/guest-batch-modal')

const GUEST_STATUS_FILTERS = [
  { code: 'ALL', label: 'Todos' },
  { code: 'PENDING', label: 'Pend.' },
  { code: 'CONFIRMED', label: 'Conf.' },
  { code: 'DECLINED', label: 'Dec.' },
] as const

const GUEST_KEYBOARD_HINTS = [
  { key: 'N', label: 'Nuevo' },
  { key: 'E', label: 'Exportar' },
  { key: 'I', label: 'Importar' },
] as const

const GUEST_SORT_HEADERS: ReadonlyArray<{ column: GuestListSortColumn | null; label: string }> = [
  { column: 'name', label: 'Nombre' },
  { column: null, label: 'Contacto' },
  { column: 'table', label: 'Mesa' },
  { column: 'guests_count', label: 'Asist.' },
  { column: 'status', label: 'Estado' },
]

interface EventDetailGuestsPanelProps {
  event: Event
  summary: GuestSummary | null
  viewState: EventDetailGuestsViewState
  onViewStateChange: Dispatch<SetStateAction<EventDetailGuestsViewState>>
  onPublicContentChanged: () => void
}

function GuestStats({ summary }: { summary: GuestSummary }) {
  const stats = [
    { label: 'Total', value: summary.total, color: 'text-zinc-100' },
    { label: 'Confirmados', value: summary.confirmed, color: 'text-lime-400' },
    { label: 'Pendientes', value: summary.pending, color: 'text-amber-400' },
    { label: 'Declinados', value: summary.declined, color: 'text-pink-400' },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col items-center rounded-xl border border-white/10 bg-zinc-900/50 py-4"
        >
          <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
          <span className="mt-1 text-xs text-zinc-500">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}

export function EventDetailGuestsPanel({
  event,
  summary,
  viewState,
  onViewStateChange,
  onPublicContentChanged,
}: EventDetailGuestsPanelProps) {
  const effectiveSummary = summary ?? EMPTY_GUEST_SUMMARY
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false)
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const debouncedSearch = useDebounce(viewState.search, 200)

  const guestsKey = eventGuestsPagePath(event.id, {
    page: viewState.page,
    page_size: GUEST_PAGE_SIZE,
    search: debouncedSearch,
    filter: viewState.status as 'ALL' | 'PENDING' | 'CONFIRMED' | 'DECLINED',
    sort: viewState.sortColumn,
    direction: viewState.sortDirection,
  })
  const {
    data: rawGuests,
    error: guestsError,
    isLoading,
    isValidating,
    mutate: retryGuests,
  } = useSWR<CheckinGuestsPageResponse>(guestsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const guestsPage = useMemo(() => readApiData<CheckinGuestsPageResponse | undefined>(rawGuests), [rawGuests])
  const guests = useMemo(() => guestsPage?.data ?? [], [guestsPage])
  const totalGuests = guestsPage?.total ?? 0
  const guestsErrorState = getDataErrorState(guestsError, rawGuests)
  const isSearchPending = debouncedSearch !== viewState.search || isValidating

  const { data: rawGuestStatuses } = useSWR<GuestStatus[] | { data?: GuestStatus[] }>(guestStatusesPath(), fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  })

  const guestStatuses = useMemo(() => {
    const catalog = readApiList<GuestStatus>(rawGuestStatuses)
    if (catalog.length > 0) return catalog

    const map = new Map<string, GuestStatus>()
    for (const guest of guests) {
      if (guest.status?.id && !map.has(guest.status.id)) map.set(guest.status.id, guest.status)
    }
    return map.size > 0 ? Array.from(map.values()) : undefined
  }, [rawGuestStatuses, guests])

  const updateViewState = useCallback(
    (patch: Partial<EventDetailGuestsViewState>) => {
      onViewStateChange((current) => ({ ...current, ...patch }))
    },
    [onViewStateChange]
  )

  useEffect(() => {
    setSelectedIds(new Set())
  }, [guestsKey])

  useEffect(() => {
    if (!guestsPage) return
    const lastPage = Math.max(guestsPage.total_pages, 1)
    if (viewState.page > lastPage) updateViewState({ page: lastPage })
  }, [guestsPage, updateViewState, viewState.page])

  const preloadGuestsPage = useCallback(
    (nextPage: number) => {
      const path = eventGuestsPagePath(event.id, {
        page: nextPage,
        page_size: GUEST_PAGE_SIZE,
        search: debouncedSearch,
        filter: viewState.status as 'ALL' | 'PENDING' | 'CONFIRMED' | 'DECLINED',
        sort: viewState.sortColumn,
        direction: viewState.sortDirection,
      })
      void Promise.resolve(preload(path, fetcher)).catch(() => undefined)
    },
    [debouncedSearch, event.id, viewState.sortColumn, viewState.sortDirection, viewState.status]
  )

  const openNewGuest = useCallback(() => {
    setSelectedGuest(null)
    setIsGuestFormOpen(true)
  }, [])

  const openEditGuest = useCallback((guest: Guest) => {
    setSelectedGuest(guest)
    setIsGuestFormOpen(true)
  }, [])

  const exportGuestsCSV = useCallback(async () => {
    if (totalGuests === 0 || exportingCSV) return
    setExportingCSV(true)
    try {
      const response = await api.get<Blob>(
        eventGuestsExportPath(event.id, {
          search: debouncedSearch,
          filter: viewState.status as 'ALL' | 'PENDING' | 'CONFIRMED' | 'DECLINED',
          sort: viewState.sortColumn,
          direction: viewState.sortDirection,
        }),
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invitados-${event.name?.replace(/\s+/g, '-').toLowerCase() || 'evento'}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(`${totalGuests} invitado${totalGuests !== 1 ? 's' : ''} exportados`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No pudimos exportar los invitados'))
    } finally {
      setExportingCSV(false)
    }
  }, [
    debouncedSearch,
    event.id,
    event.name,
    exportingCSV,
    totalGuests,
    viewState.sortColumn,
    viewState.sortDirection,
    viewState.status,
  ])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const tagName = (event.target as HTMLElement).tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        openNewGuest()
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault()
        exportGuestsCSV()
      }
      if (event.key === 'i' || event.key === 'I') {
        event.preventDefault()
        setIsBatchOpen(true)
      }
      if (event.key === 'Escape') setSelectedIds(new Set())
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openNewGuest, exportGuestsCSV])

  const bulkUpdateStatus = useCallback(
    async (statusCode: GuestStatusCode) => {
      if (selectedIds.size === 0 || !guestStatuses) return
      const targetStatus = findGuestStatusByCode(guestStatuses, statusCode)
      if (!targetStatus) {
        toast.error('Catálogo de estados no disponible')
        return
      }

      const selectedGuestIds = Array.from(selectedIds)
      const previousGuests = rawGuests
      const payload = buildGuestStatusUpdatePayload(targetStatus)
      const fallbackPatch = buildGuestStatusCachePatch(targetStatus, payload)
      setBulkLoading(true)
      try {
        await retryGuests(
          (current) =>
            patchGuestsCacheValue(current ?? previousGuests, selectedGuestIds, fallbackPatch) as CheckinGuestsPageResponse,
          { revalidate: false }
        )
        await api.patch(bulkGuestStatusPath(), {
          event_id: event.id,
          ids: selectedGuestIds,
          ...payload,
        })
        void retryGuests()
        onPublicContentChanged()
        toast.success(`${selectedGuestIds.length} invitado${selectedGuestIds.length !== 1 ? 's' : ''} actualizados`)
        setSelectedIds(new Set())
      } catch (error) {
        await retryGuests(previousGuests, { revalidate: false })
        toast.error(getApiErrorMessage(error, 'Error al actualizar algunos invitados'))
      } finally {
        setBulkLoading(false)
      }
    },
    [event.id, guestStatuses, onPublicContentChanged, rawGuests, retryGuests, selectedIds]
  )

  const bulkDeleteGuests = useCallback(async () => {
    if (selectedIds.size === 0) return

    const selectedGuestIds = Array.from(selectedIds)
    const previousGuests = rawGuests
    setBulkLoading(true)
    try {
      await retryGuests(
        (current) => removeGuestsCacheValue(current ?? previousGuests, selectedGuestIds) as CheckinGuestsPageResponse,
        { revalidate: false }
      )
      await api.delete(bulkGuestsPath(), { data: { ids: selectedGuestIds } })
      void retryGuests()
      onPublicContentChanged()
      toast.success(`${selectedGuestIds.length} invitado${selectedGuestIds.length !== 1 ? 's' : ''} eliminados`)
      setSelectedIds(new Set())
    } catch (error) {
      await retryGuests(previousGuests, { revalidate: false })
      toast.error(getApiErrorMessage(error, 'Error al eliminar los invitados'))
    } finally {
      setBulkLoading(false)
      setIsBulkDeleteOpen(false)
    }
  }, [onPublicContentChanged, rawGuests, retryGuests, selectedIds])

  const saveGuestInCurrentPage = useCallback(
    async (savedGuest: Guest | null) => {
      if (!savedGuest) {
        void retryGuests()
        return
      }
      const alreadyVisible = guests.some((guest) => guest.id === savedGuest.id)
      const matchesSearch = `${savedGuest.first_name} ${savedGuest.last_name} ${savedGuest.email ?? ''} ${savedGuest.table_number ?? ''}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      const matchesFilter = viewState.status === 'ALL' || getEffectiveStatus(savedGuest) === viewState.status
      if (!alreadyVisible && (viewState.page !== 1 || !matchesSearch || !matchesFilter)) {
        void retryGuests()
        return
      }
      await retryGuests(
        (current) => upsertGuestCacheValue(current ?? rawGuests, savedGuest) as CheckinGuestsPageResponse,
        { revalidate: false }
      )
    },
    [debouncedSearch, guests, rawGuests, retryGuests, viewState.page, viewState.status]
  )

  const removeGuestFromCurrentPage = useCallback(
    async (guest: Guest) => {
      await retryGuests(
        (current) => removeGuestsCacheValue(current ?? rawGuests, [guest.id]) as CheckinGuestsPageResponse,
        { revalidate: false }
      )
    },
    [rawGuests, retryGuests]
  )

  const restoreGuestToCurrentPage = useCallback(
    async (guest: Guest) => {
      await retryGuests(
        (current) => upsertGuestCacheValue(current ?? rawGuests, guest) as CheckinGuestsPageResponse,
        { revalidate: false }
      )
    },
    [rawGuests, retryGuests]
  )

  const paginatedGuests = guests

  const changeSort = (column: GuestListSortColumn) => {
    if (viewState.sortColumn === column) {
      updateViewState({ sortDirection: viewState.sortDirection === 'asc' ? 'desc' : 'asc' })
      return
    }
    updateViewState({ sortColumn: column, sortDirection: 'asc' })
  }

  const copyRsvpLink = async (guest: Guest) => {
    if (!hasGuestRsvpToken(guest)) {
      toast.error('Este invitado no tiene token RSVP generado')
      return
    }
    try {
      await navigator.clipboard.writeText(getGuestRsvpUrl(guest, event.identifier))
      toast.success('Link RSVP copiado')
    } catch {
      toast.error('No se pudo copiar el link RSVP')
    }
  }

  if (guestsErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar los invitados"
        description="La colección permanece intacta. Reintenta para recuperar esta página."
        onRetry={() => void retryGuests()}
        retrying={isValidating}
        icon={UsersIcon}
      />
    )
  }
  if (isLoading) return <EventDetailPanelSkeleton tab="invitados" />

  return (
    <div>
      {effectiveSummary.total > 0 && <GuestStats summary={effectiveSummary} />}
      {guestsErrorState === 'stale' && (
        <div className="mb-4">
          <StaleDataNotice label="invitados" onRetry={() => void retryGuests()} retrying={isValidating} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="event-guests-search" className="sr-only">
            Buscar invitados
          </label>
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id="event-guests-search"
            type="search"
            placeholder="Nombre, correo, mesa…"
            value={viewState.search}
            onChange={(event) => updateViewState({ search: event.target.value, page: 1 })}
            aria-busy={isSearchPending}
            className="min-h-10 w-full rounded-lg border border-white/10 bg-zinc-900 py-2 pr-3 pl-9 text-sm text-zinc-200 placeholder-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filtrar invitados por estado"
            className="flex overflow-hidden rounded-lg border border-white/10"
          >
            {GUEST_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.code}
                type="button"
                aria-pressed={viewState.status === filter.code}
                onClick={() => updateViewState({ status: filter.code, page: 1 })}
                className={[
                  'min-h-10 px-3 py-1.5 text-xs font-medium transition-colors',
                  viewState.status === filter.code
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                ].join(' ')}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {totalGuests > 0 && (
            <Button
              outline
              onClick={() => void exportGuestsCSV()}
              disabled={exportingCSV}
              title="Exportar todos los invitados que coinciden con los filtros"
            >
              <ArrowDownTrayIcon aria-hidden="true" className="size-4" />
              {exportingCSV ? 'Exportando…' : 'CSV completo'}
            </Button>
          )}
          <Button
            outline
            onFocus={() => void preloadGuestBatchModal().catch(() => undefined)}
            onPointerEnter={() => void preloadGuestBatchModal().catch(() => undefined)}
            onClick={() => setIsBatchOpen(true)}
          >
            Importar
          </Button>
          <Button
            onFocus={() => void preloadGuestFormModal().catch(() => undefined)}
            onPointerEnter={() => void preloadGuestFormModal().catch(() => undefined)}
            onClick={openNewGuest}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            Agregar
          </Button>
        </div>
      </div>

      <div aria-hidden="true" className="mb-2 hidden items-center gap-3 text-zinc-700 sm:flex">
        {GUEST_KEYBOARD_HINTS.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1 text-[11px]">
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
              {key}
            </kbd>
            {label}
          </span>
        ))}
      </div>

      {guests.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={effectiveSummary.total === 0 ? 'Sin invitados' : 'Sin resultados'}
          description={
            effectiveSummary.total === 0
              ? 'Comienza agregando los primeros invitados a este evento.'
              : 'Ningún invitado coincide con los filtros aplicados.'
          }
          action={effectiveSummary.total === 0 ? { label: 'Agregar invitado', onClick: openNewGuest } : undefined}
        />
      ) : (
        <div className="relative">
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="sticky top-2 z-10 mb-3 flex flex-col justify-between gap-2 rounded-xl border border-indigo-500/30 bg-indigo-950/80 px-4 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:gap-3 sm:py-2.5"
              >
                <span className="text-sm font-medium text-indigo-300">
                  {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {guestStatuses && (
                    <>
                      <button
                        type="button"
                        onClick={() => void bulkUpdateStatus('CONFIRMED')}
                        disabled={bulkLoading}
                        className="flex min-h-9 items-center gap-1.5 rounded-lg bg-lime-500/20 px-2.5 py-1.5 text-xs font-medium text-lime-400 transition-colors hover:bg-lime-500/30 disabled:opacity-50 sm:px-3"
                      >
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => void bulkUpdateStatus('DECLINED')}
                        disabled={bulkLoading}
                        className="min-h-9 rounded-lg bg-pink-500/20 px-2.5 py-1.5 text-xs font-medium text-pink-400 transition-colors hover:bg-pink-500/30 disabled:opacity-50 sm:px-3"
                      >
                        Declinar
                      </button>
                      <button
                        type="button"
                        onClick={() => void bulkUpdateStatus('PENDING')}
                        disabled={bulkLoading}
                        className="min-h-9 rounded-lg bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-50 sm:px-3"
                      >
                        Pendiente
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={bulkLoading}
                    className="min-h-9 rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 sm:px-3"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto grid size-9 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 sm:ml-1"
                    aria-label="Limpiar selección"
                  >
                    <XMarkIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isDesktop ? (
            <div data-guest-layout="mobile" className="mb-2 space-y-2">
              {paginatedGuests.map((guest) => (
                <div key={guest.id} className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {guest.first_name} {guest.last_name}
                      </p>
                      {guest.email && <p className="mt-0.5 truncate text-xs text-zinc-500">{guest.email}</p>}
                      {guest.phone && <p className="mt-0.5 text-xs text-zinc-500">{guest.phone}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copyRsvpLink(guest)}
                        disabled={!hasGuestRsvpToken(guest)}
                        className="grid size-10 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Copiar link RSVP"
                        title={hasGuestRsvpToken(guest) ? 'Copiar link RSVP' : 'Sin token RSVP'}
                      >
                        <LinkIcon aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onFocus={() => void preloadGuestFormModal().catch(() => undefined)}
                        onPointerEnter={() => void preloadGuestFormModal().catch(() => undefined)}
                        onClick={() => openEditGuest(guest)}
                        className="grid size-10 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
                        aria-label={`Editar a ${guest.first_name}`}
                      >
                        <PencilIcon aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onFocus={() => void preloadGuestDeleteModal().catch(() => undefined)}
                        onPointerEnter={() => void preloadGuestDeleteModal().catch(() => undefined)}
                        onClick={() => setGuestToDelete(guest)}
                        className="grid size-10 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-pink-500/10 hover:text-pink-400"
                        aria-label={`Eliminar a ${guest.first_name}`}
                      >
                        <TrashIcon aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <GuestStatusBadge code={getEffectiveStatus(guest)} />
                    {getGuestTableLabel(guest) && (
                      <span className="text-xs text-zinc-500">{getGuestTableLabel(guest)}</span>
                    )}
                    {getGuestCompanionCount(guest) > 0 && (
                      <span className="text-xs text-zinc-500">+{getGuestCompanionCount(guest)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div data-guest-layout="desktop" className="overflow-x-auto rounded-xl border border-white/10">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar invitados de esta página"
                        checked={
                          paginatedGuests.length > 0 && paginatedGuests.every((guest) => selectedIds.has(guest.id))
                        }
                        onChange={(event) =>
                          setSelectedIds(
                            event.target.checked ? new Set(paginatedGuests.map((guest) => guest.id)) : new Set()
                          )
                        }
                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950"
                      />
                    </TableHeader>
                    {GUEST_SORT_HEADERS.map(({ column, label }) => (
                      <TableHeader key={label}>
                        {column ? (
                          <button
                            type="button"
                            onClick={() => changeSort(column)}
                            className="flex items-center gap-1 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase transition-colors hover:text-zinc-300"
                            aria-label={`Ordenar por ${label}`}
                          >
                            {label}
                            <span aria-hidden="true" className="text-[10px]">
                              {viewState.sortColumn === column ? (viewState.sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </button>
                        ) : (
                          label
                        )}
                      </TableHeader>
                    ))}
                    <TableHeader>
                      <span className="sr-only">Acciones</span>
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <AnimatePresence>
                    {paginatedGuests.map((guest, index) => {
                      const isSelected = selectedIds.has(guest.id)
                      const dietaryRestrictions = getGuestDietaryRestrictions(guest)
                      const rsvpNotes = getGuestRsvpNotes(guest)
                      return (
                        <motion.tr
                          key={guest.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ delay: Math.min(index, 6) * 0.015, duration: 0.15 }}
                          className={isSelected ? 'bg-indigo-500/5' : ''}
                        >
                          <TableCell className="w-10">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar a ${guest.first_name} ${guest.last_name}`}
                              checked={isSelected}
                              onChange={(event) => {
                                const next = new Set(selectedIds)
                                if (event.target.checked) next.add(guest.id)
                                else next.delete(guest.id)
                                setSelectedIds(next)
                              }}
                              className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950"
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="text-zinc-100">
                              {guest.first_name} {guest.last_name}
                            </span>
                            {dietaryRestrictions && (
                              <p className="mt-0.5 max-w-full truncate text-xs text-zinc-500">{dietaryRestrictions}</p>
                            )}
                            {rsvpNotes && (
                              <p className="mt-0.5 max-w-full truncate text-xs text-zinc-500">RSVP: {rsvpNotes}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {guest.email ? <p className="text-xs">{guest.email}</p> : null}
                            {guest.phone ? <p className="text-xs text-zinc-600">{guest.phone}</p> : null}
                            {!guest.email && !guest.phone && <span className="text-zinc-700">—</span>}
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {getGuestTableLabel(guest) || <span className="text-zinc-700">—</span>}
                          </TableCell>
                          <TableCell className="text-zinc-400 tabular-nums">{getGuestPartySize(guest)}</TableCell>
                          <TableCell>
                            <GuestStatusSelect
                              guest={guest}
                              eventIdentifier={event.identifier}
                              eventId={event.id}
                              statuses={guestStatuses}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void copyRsvpLink(guest)}
                                disabled={!hasGuestRsvpToken(guest)}
                                className="grid size-9 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Copiar link RSVP"
                                title={hasGuestRsvpToken(guest) ? 'Copiar link RSVP' : 'Sin token RSVP'}
                              >
                                <LinkIcon aria-hidden="true" className="size-3.5" />
                              </button>
                              {guest.phone && hasGuestRsvpToken(guest) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const rsvpUrl = getGuestRsvpUrl(guest, event.identifier)
                                    const message = encodeURIComponent(
                                      `Hola ${guest.first_name}, te invitamos a "${event.name}". Confirma tu asistencia aquí: ${rsvpUrl}`
                                    )
                                    window.open(
                                      `https://wa.me/${guest.phone!.replace(/\D/g, '')}?text=${message}`,
                                      '_blank'
                                    )
                                  }}
                                  className="grid size-9 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-lime-500/10 hover:text-lime-400"
                                  aria-label="Enviar por WhatsApp"
                                  title="Enviar invitación por WhatsApp"
                                >
                                  <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                  </svg>
                                </button>
                              )}
                              <button
                                type="button"
                                onFocus={() => void preloadGuestFormModal().catch(() => undefined)}
                                onPointerEnter={() => void preloadGuestFormModal().catch(() => undefined)}
                                onClick={() => openEditGuest(guest)}
                                className="grid size-9 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
                                aria-label={`Editar a ${guest.first_name}`}
                              >
                                <PencilIcon aria-hidden="true" className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onFocus={() => void preloadGuestDeleteModal().catch(() => undefined)}
                                onPointerEnter={() => void preloadGuestDeleteModal().catch(() => undefined)}
                                onClick={() => setGuestToDelete(guest)}
                                className="grid size-9 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-pink-500/10 hover:text-pink-400"
                                aria-label={`Eliminar a ${guest.first_name}`}
                              >
                                <TrashIcon aria-hidden="true" className="size-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      )
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination
            total={totalGuests}
            page={viewState.page}
            pageSize={GUEST_PAGE_SIZE}
            onPageChange={(page) => updateViewState({ page })}
            onPageIntent={preloadGuestsPage}
          />
        </div>
      )}

      {isGuestFormOpen && (
        <GuestFormModal
          isOpen={isGuestFormOpen}
          setIsOpen={setIsGuestFormOpen}
          eventId={event.id}
          guest={selectedGuest}
          onPublicContentChanged={onPublicContentChanged}
          onSaved={saveGuestInCurrentPage}
        />
      )}
      {guestToDelete && (
        <GuestDeleteModal
          guest={guestToDelete}
          eventIdentifier={event.identifier}
          eventId={event.id}
          onClose={() => setGuestToDelete(null)}
          onPublicContentChanged={onPublicContentChanged}
          onOptimisticDelete={removeGuestFromCurrentPage}
          onDeleteRollback={restoreGuestToCurrentPage}
          onRevalidate={() => void retryGuests()}
        />
      )}
      {isBatchOpen && (
        <GuestBatchModal
          isOpen={isBatchOpen}
          setIsOpen={setIsBatchOpen}
          eventId={event.id}
          onPublicContentChanged={onPublicContentChanged}
          onCreated={() => void retryGuests()}
        />
      )}
      <ConfirmAlert
        open={isBulkDeleteOpen}
        title={`¿Eliminar ${selectedIds.size} invitado${selectedIds.size !== 1 ? 's' : ''}?`}
        description="Se eliminarán permanentemente del evento. Esta acción no se puede deshacer."
        confirmLabel="Eliminar invitados"
        busy={bulkLoading}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={bulkDeleteGuests}
      />
    </div>
  )
}
