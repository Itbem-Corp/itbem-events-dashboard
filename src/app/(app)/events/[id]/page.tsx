'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { useParams } from 'next/navigation'
import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageTransition } from '@/components/ui/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { GuestStatusSelect } from '@/components/guests/guest-status-select'
import { RSVPTracker } from '@/components/events/rsvp-tracker'
import { EventConfigPanel } from '@/components/events/event-config-panel'
import { EventSectionsManager } from '@/components/events/event-sections-manager'
import { EventCoverUpload } from '@/components/events/event-cover-upload'
import { EventSharePanel } from '@/components/events/event-share-panel'
import { EventAnalyticsPanel } from '@/components/events/event-analytics-panel'

const EventDesignPicker = dynamic(
  () => import('@/components/events/event-design-picker').then((m) => m.EventDesignPicker),
  { ssr: false }
)

const SeatingPlan = dynamic(
  () => import('@/components/events/seating-plan').then((m) => m.SeatingPlan),
  { ssr: false }
)
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table'

import { motion, AnimatePresence } from 'motion/react'
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ChevronLeftIcon, PlusIcon, PencilIcon, TrashIcon, ArrowDownTrayIcon, CheckIcon, LinkIcon, ArrowTopRightOnSquareIcon, PaintBrushIcon } from '@heroicons/react/16/solid'
import {
  UsersIcon,
  PhotoIcon,
  ChartBarIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
  XMarkIcon,
  InboxArrowDownIcon,
  RectangleGroupIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/20/solid'

const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://itbem.events'

// Lazy-loaded modals & heavy components
const EventFormModal = dynamic(
  () => import('@/components/events/forms/event-form-modal').then((m) => m.EventFormModal),
  { ssr: false }
)
const GuestFormModal = dynamic(
  () => import('@/components/guests/forms/guest-form-modal').then((m) => m.GuestFormModal),
  { ssr: false }
)
const GuestDeleteModal = dynamic(
  () => import('@/components/guests/guest-delete-modal').then((m) => m.GuestDeleteModal),
  { ssr: false }
)
const GuestBatchModal = dynamic(
  () => import('@/components/guests/forms/guest-batch-modal').then((m) => m.GuestBatchModal),
  { ssr: false }
)
const MomentsWall = dynamic(
  () => import('@/components/events/moments-wall').then((m) => m.MomentsWall),
  { ssr: false }
)
const InvitationTracker = dynamic(
  () => import('@/components/events/invitation-tracker').then((m) => m.InvitationTracker),
  { ssr: false }
)

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'resumen',       label: 'Resumen',      icon: HomeIcon },
  { id: 'invitados',     label: 'Invitados',    icon: UsersIcon },
  { id: 'invitaciones',  label: 'Invitaciones', icon: InboxArrowDownIcon },
  { id: 'asientos',      label: 'Mesas',        icon: RectangleGroupIcon },
  { id: 'rsvp',         label: 'RSVP',         icon: EnvelopeIcon },
  { id: 'momentos',     label: 'Momentos',     icon: PhotoIcon },
  { id: 'analiticas',   label: 'Analíticas',   icon: ChartBarIcon },
  { id: 'configuracion', label: 'Config.',     icon: Cog6ToothIcon },
] as const

type TabId = (typeof TABS)[number]['id']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateString: string): number {
  const now = new Date()
  const eventDate = new Date(dateString)
  return Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatEventDate(dateString: string, timezone: string) {
  return new Date(dateString).toLocaleString('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone || 'UTC',
  })
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

function EventDetailSkeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="h-4 w-24 bg-zinc-800 rounded" />
      <div className="h-8 w-72 bg-zinc-800 rounded" />
      <div className="h-4 w-56 bg-zinc-800 rounded" />
      {/* Tab bar */}
      <div className="mt-8 flex gap-0.5 border-b border-white/10 pb-px">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-zinc-800/60 rounded-t-lg" />
        ))}
      </div>
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-800 rounded-xl" />
        ))}
      </div>
      {/* Description block */}
      <div className="space-y-2">
        <div className="h-4 w-28 bg-zinc-800 rounded" />
        <div className="h-3 w-full bg-zinc-800 rounded" />
        <div className="h-3 w-3/4 bg-zinc-800 rounded" />
      </div>
    </div>
  )
}

function InvitadosTabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stats mini-grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center rounded-xl border border-white/10 bg-zinc-900/50 py-4 gap-2">
            <div className="h-7 w-10 bg-zinc-800 rounded" />
            <div className="h-2.5 w-16 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-48 bg-zinc-800 rounded-lg" />
        <div className="h-9 w-36 bg-zinc-800 rounded-lg" />
        <div className="h-9 w-20 bg-zinc-800 rounded-lg" />
        <div className="h-9 w-24 bg-zinc-800 rounded-lg ml-auto" />
      </div>
      {/* Table rows */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 last:border-0">
            <div className="h-4 flex-1 bg-zinc-800 rounded" />
            <div className="h-3 w-28 bg-zinc-800 rounded" />
            <div className="h-3 w-10 bg-zinc-800 rounded" />
            <div className="h-3 w-6 bg-zinc-800 rounded" />
            <div className="h-6 w-20 bg-zinc-800 rounded-md" />
            <div className="h-6 w-12 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}


// ─── Page ────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<TabId>('resumen')

  // Event modals
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Guest modals
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false)
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null)

  // Guest list filters + pagination + sorting
  const [guestSearch, setGuestSearch] = useState('')
  const [guestFilter, setGuestFilter] = useState('ALL')
  const [guestPage, setGuestPage] = useState(1)
  const GUEST_PAGE_SIZE = 50
  const [sortCol, setSortCol] = useState<'name' | 'status' | 'table' | 'guests_count'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Reset pagination when filters change
  useEffect(() => { setGuestPage(1) }, [guestSearch, guestFilter])

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Data fetching
  const { data: event, isLoading, error } = useSWR<Event>(
    id ? `/events/${id}` : null,
    fetcher
  )

  const { data: guests = [], isLoading: guestsLoading } = useSWR<Guest[]>(
    event?.identifier ? `/guests/${event.identifier}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Guest status catalog — graceful fallback if endpoint doesn't exist
  const { data: guestStatuses } = useSWR<import('@/models/GuestStatus').GuestStatus[]>(
    '/catalogs/guest-statuses',
    fetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )

  // Guest actions
  const openNewGuest = useCallback(() => {
    setSelectedGuest(null)
    setIsGuestFormOpen(true)
  }, [])

  const openEditGuest = useCallback((guest: Guest) => {
    setSelectedGuest(guest)
    setIsGuestFormOpen(true)
  }, [])

  const exportGuestsCSV = useCallback(() => {
    if (guests.length === 0) return
    const headers = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Mesa', '+1s', 'Estado', 'Restricciones']
    const rows = guests.map((g) => [
      g.first_name,
      g.last_name,
      g.email ?? '',
      g.phone ?? '',
      g.table_number ?? '',
      String(g.guests_count ?? 1),
      g.status?.code ?? 'PENDING',
      g.dietary_restrictions ?? '',
    ])
    const csvContent = [headers, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invitados-${event?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'evento'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [guests, event?.name])

  // Keyboard shortcuts (Invitados tab only, no input focused)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (activeTab === 'invitados') {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewGuest() }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); exportGuestsCSV() }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setIsBatchOpen(true) }
        if (e.key === 'Escape') { setSelectedIds(new Set()) }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTab, openNewGuest, exportGuestsCSV])

  const bulkUpdateStatus = useCallback(async (statusCode: string) => {
    if (!event || selectedIds.size === 0 || !guestStatuses) return
    const targetStatus = guestStatuses.find((s) => s.code === statusCode)
    if (!targetStatus) {
      toast.error('Catálogo de estados no disponible')
      return
    }
    setBulkLoading(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map((guestId) => {
          const guest = guests.find((g) => g.id === guestId)
          if (!guest) return Promise.resolve()
          return api.put(`/guests/${guestId}`, { ...guest, status_id: targetStatus.id })
        })
      )
      await mutate(`/guests/${event.identifier}`)
      toast.success(`${selectedIds.size} invitado${selectedIds.size !== 1 ? 's' : ''} actualizados`)
      setSelectedIds(new Set())
    } catch {
      toast.error('Error al actualizar algunos invitados')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, guests, guestStatuses, event])

  const bulkDeleteGuests = useCallback(async () => {
    if (!event || selectedIds.size === 0) return
    if (!window.confirm(`¿Eliminar ${selectedIds.size} invitado${selectedIds.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    setBulkLoading(true)
    try {
      await api.delete('/guests/bulk', { data: { ids: Array.from(selectedIds) } })
      await mutate(`/guests/${event.identifier}`)
      toast.success(`${selectedIds.size} invitado${selectedIds.size !== 1 ? 's' : ''} eliminados`)
      setSelectedIds(new Set())
    } catch {
      toast.error('Error al eliminar los invitados')
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, event])

  // Derived guest stats
  const confirmed = guests.filter((g) => g.status?.code === 'CONFIRMED')
  const pending = guests.filter((g) => g.status?.code === 'PENDING')
  const declined = guests.filter((g) => g.status?.code === 'DECLINED')
  const totalAttendees = confirmed.reduce((sum, g) => sum + (g.guests_count ?? 1), 0)

  const filteredGuests = guests
    .filter((g) => {
      const matchesSearch =
        guestSearch === '' ||
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(guestSearch.toLowerCase()) ||
        (g.email ?? '').toLowerCase().includes(guestSearch.toLowerCase()) ||
        (g.table_number ?? '').toLowerCase().includes(guestSearch.toLowerCase())
      const matchesStatus = guestFilter === 'ALL' || g.status?.code === guestFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') {
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      } else if (sortCol === 'status') {
        cmp = (a.status?.code ?? '').localeCompare(b.status?.code ?? '')
      } else if (sortCol === 'table') {
        cmp = (a.table_number ?? '').localeCompare(b.table_number ?? '')
      } else if (sortCol === 'guests_count') {
        cmp = (a.guests_count ?? 1) - (b.guests_count ?? 1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const paginatedGuests = filteredGuests.slice(
    (guestPage - 1) * GUEST_PAGE_SIZE,
    guestPage * GUEST_PAGE_SIZE
  )

  // ── Loading / Error states ──────────────────────────────────────────────────

  if (isLoading) return <EventDetailSkeleton />

  if (error || !event) {
    return (
      <div className="py-24 text-center text-sm text-red-400">
        No se pudo cargar el evento. Verifica que exista o intenta de nuevo.
      </div>
    )
  }

  const daysUntil = getDaysUntil(event.event_date_time)
  const isPast = daysUntil < 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageTransition>
      {/* Breadcrumb */}
      <div className="max-lg:hidden">
        <Link
          href="/events"
          className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronLeftIcon className="size-4 fill-zinc-500" />
          Eventos
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Heading>{event.name}</Heading>
          <Badge color={event.is_active ? 'lime' : 'zinc'}>
            {event.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/events/${id}/studio`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-colors"
          >
            <PaintBrushIcon className="size-4" />
            Studio
          </a>
          <a
            href={`${PUBLIC_FRONTEND_URL}/e/${event.identifier}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-400 hover:border-white/20 hover:text-zinc-200 transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
            Vista previa
          </a>
          <a
            href={`/events/${id}/checkin`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-sm font-medium text-lime-400 hover:bg-lime-500/20 hover:border-lime-500/50 transition-colors"
          >
            <ClipboardDocumentCheckIcon className="size-4" />
            Check-in
          </a>
          <Button outline onClick={() => setIsEditOpen(true)}>
            Editar evento
          </Button>
        </div>
      </div>

      {/* Event meta */}
      <p className="mt-2 text-sm/6 text-zinc-500">
        {formatEventDate(event.event_date_time, event.timezone)}
        {event.address && (
          <>
            <span aria-hidden="true"> · </span>
            {event.address}
          </>
        )}
        <span aria-hidden="true"> · </span>
        {daysUntil === 0 ? (
          <span className="text-amber-400 font-medium">¡Hoy!</span>
        ) : isPast ? (
          <span className="text-zinc-600">Hace {Math.abs(daysUntil)} días</span>
        ) : daysUntil <= 7 ? (
          <span className="text-amber-400 font-medium">En {daysUntil} día{daysUntil !== 1 ? 's' : ''}</span>
        ) : (
          <span>En {daysUntil} días</span>
        )}
      </p>

      {/* Tab navigation */}
      <div className="mt-8 border-b border-white/10">
        <nav className="flex gap-0.5 overflow-x-auto pb-px scrollbar-none" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5',
                ].join(' ')}
                aria-selected={isActive}
                role="tab"
              >
                <Icon className="size-4 shrink-0" />
                {tab.label}
                {tab.id === 'invitados' && guests.length > 0 && (
                  <span className="ml-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                    {guests.length}
                  </span>
                )}
                {tab.id === 'invitaciones' && guests.length > 0 && (
                  (() => {
                    const pendingCount = guests.filter(
                      (g) => !['CONFIRMED', 'DECLINED'].includes((g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase())
                    ).length
                    return pendingCount > 0 ? (
                      <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                        {pendingCount}
                      </span>
                    ) : null
                  })()
                )}
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mt-6"
        >
          {/* ── RESUMEN ─────────────────────────────────────────────────────── */}
          {activeTab === 'resumen' && (
            <div className="space-y-10">
              {/* KPI grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: 'Máx. invitados',
                    value: event.max_guests != null ? String(event.max_guests) : 'Sin límite',
                  },
                  {
                    label: 'Confirmados',
                    value: guests.length > 0
                      ? `${confirmed.length} (${totalAttendees} tot.)`
                      : '—',
                  },
                  { label: 'Tipo de evento', value: event.event_type?.name || '—' },
                  {
                    label: isPast ? 'Días desde el evento' : 'Días para el evento',
                    value: daysUntil === 0 ? '¡Hoy!' : String(Math.abs(daysUntil)),
                  },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.25 }}
                    className="rounded-xl border border-white/10 bg-zinc-900/50 p-5"
                  >
                    <p className="text-xs text-zinc-400 uppercase font-semibold tracking-wide">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Description */}
              {event.description && (
                <div>
                  <Subheading>Descripción</Subheading>
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{event.description}</p>
                </div>
              )}

              {/* Organizer */}
              {(event.organizer_name || event.organizer_email || event.organizer_phone) && (
                <div>
                  <Subheading>Organizador</Subheading>
                  <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900/50 p-5 space-y-1.5">
                    {event.organizer_name && (
                      <p className="text-sm font-medium text-zinc-200">{event.organizer_name}</p>
                    )}
                    {event.organizer_email && (
                      <p className="text-sm text-zinc-400">
                        <a
                          href={`mailto:${event.organizer_email}`}
                          className="hover:text-zinc-200 transition-colors"
                        >
                          {event.organizer_email}
                        </a>
                      </p>
                    )}
                    {event.organizer_phone && (
                      <p className="text-sm text-zinc-500">{event.organizer_phone}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Guest summary (only if guests are loaded) */}
              {guests.length > 0 && (
                <div>
                  <Subheading>Resumen de invitados</Subheading>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Confirmados', value: confirmed.length, color: 'text-lime-400' },
                      { label: 'Pendientes', value: pending.length, color: 'text-amber-400' },
                      { label: 'Declinados', value: declined.length, color: 'text-pink-400' },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4"
                      >
                        <span className="text-sm text-zinc-400">{s.label}</span>
                        <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cover image */}
              <div>
                <Subheading>Imagen de portada</Subheading>
                <div className="mt-3">
                  <EventCoverUpload event={event} />
                </div>
              </div>

              {/* Go to guests CTA */}
              {guests.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
                  <UsersIcon className="mx-auto size-8 text-zinc-600 mb-3" />
                  <p className="text-sm font-medium text-zinc-400">Sin invitados aún</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Agrega invitados desde la pestaña &ldquo;Invitados&rdquo;.
                  </p>
                  <Button className="mt-4" onClick={() => setActiveTab('invitados')}>
                    Ir a invitados
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── INVITADOS ───────────────────────────────────────────────────── */}
          {activeTab === 'invitados' && (
            guestsLoading ? <InvitadosTabSkeleton /> :
            <div>
              {/* Stats summary */}
              {guests.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
                  {[
                    { label: 'Total', value: guests.length, color: 'text-zinc-100' },
                    { label: 'Confirmados', value: confirmed.length, color: 'text-lime-400' },
                    { label: 'Pendientes', value: pending.length, color: 'text-amber-400' },
                    { label: 'Declinados', value: declined.length, color: 'text-pink-400' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="flex flex-col items-center rounded-xl border border-white/10 bg-zinc-900/50 py-4"
                    >
                      <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                      <span className="mt-1 text-xs text-zinc-500">{s.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                  <input
                    type="search"
                    placeholder="Nombre, correo, mesa…"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {/* Status filter */}
                  <div className="flex rounded-lg overflow-hidden border border-white/10">
                    {[
                      { code: 'ALL', label: 'Todos' },
                      { code: 'PENDING', label: 'Pend.' },
                      { code: 'CONFIRMED', label: 'Conf.' },
                      { code: 'DECLINED', label: 'Dec.' },
                    ].map((f) => (
                      <button
                        key={f.code}
                        onClick={() => setGuestFilter(f.code)}
                        className={[
                          'px-3 py-1.5 text-xs font-medium transition-colors',
                          guestFilter === f.code
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                        ].join(' ')}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {guests.length > 0 && (
                    <Button outline onClick={exportGuestsCSV} title="Exportar a CSV">
                      <ArrowDownTrayIcon className="size-4" />
                      CSV
                    </Button>
                  )}
                  <Button outline onClick={() => setIsBatchOpen(true)}>
                    Importar
                  </Button>
                  <Button onClick={openNewGuest}>
                    <PlusIcon className="size-4" />
                    Agregar
                  </Button>
                </div>
              </div>

              {/* Keyboard hints */}
              <div className="hidden sm:flex items-center gap-3 mb-2 text-zinc-700">
                {[
                  { key: 'N', label: 'Nuevo' },
                  { key: 'E', label: 'Exportar' },
                  { key: 'I', label: 'Importar' },
                ].map(({ key, label }) => (
                  <span key={key} className="flex items-center gap-1 text-[11px]">
                    <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                      {key}
                    </kbd>
                    {label}
                  </span>
                ))}
              </div>

              {/* Guest list */}
              {filteredGuests.length === 0 ? (
                <EmptyState
                  icon={UsersIcon}
                  title={guests.length === 0 ? 'Sin invitados' : 'Sin resultados'}
                  description={
                    guests.length === 0
                      ? 'Comienza agregando los primeros invitados a este evento.'
                      : 'Ningún invitado coincide con los filtros aplicados.'
                  }
                  action={
                    guests.length === 0
                      ? { label: 'Agregar invitado', onClick: openNewGuest }
                      : undefined
                  }
                />
              ) : (
                <div className="relative">
                  {/* Bulk action bar */}
                  <AnimatePresence>
                    {selectedIds.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="sticky top-2 z-10 mb-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/80 px-4 py-2.5 backdrop-blur-sm shadow-lg"
                      >
                        <span className="text-sm font-medium text-indigo-300">
                          {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          {guestStatuses && (
                            <>
                              <button
                                onClick={() => bulkUpdateStatus('CONFIRMED')}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 rounded-lg bg-lime-500/20 px-3 py-1.5 text-xs font-medium text-lime-400 hover:bg-lime-500/30 transition-colors disabled:opacity-50"
                              >
                                <CheckIcon className="size-3.5" />
                                Confirmar
                              </button>
                              <button
                                onClick={() => bulkUpdateStatus('DECLINED')}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 rounded-lg bg-pink-500/20 px-3 py-1.5 text-xs font-medium text-pink-400 hover:bg-pink-500/30 transition-colors disabled:opacity-50"
                              >
                                Declinar
                              </button>
                              <button
                                onClick={() => bulkUpdateStatus('PENDING')}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                              >
                                Pendiente
                              </button>
                            </>
                          )}
                          <button
                            onClick={bulkDeleteGuests}
                            disabled={bulkLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                          <button
                            onClick={() => setSelectedIds(new Set())}
                            className="ml-1 p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            <XMarkIcon className="size-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeader className="w-10">
                            <input
                              type="checkbox"
                              checked={paginatedGuests.length > 0 && paginatedGuests.every((g) => selectedIds.has(g.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedIds(new Set(paginatedGuests.map((g) => g.id)))
                                } else {
                                  setSelectedIds(new Set())
                                }
                              }}
                              className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950"
                            />
                          </TableHeader>
                          {(
                            [
                              { col: 'name', label: 'Nombre' },
                              { col: null, label: 'Contacto' },
                              { col: 'table', label: 'Mesa' },
                              { col: 'guests_count', label: '+1s' },
                              { col: 'status', label: 'Estado' },
                            ] as { col: typeof sortCol | null; label: string }[]
                          ).map(({ col, label }) => (
                            <TableHeader key={label}>
                              {col ? (
                                <button
                                  onClick={() => {
                                    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                                    else { setSortCol(col); setSortDir('asc') }
                                  }}
                                  className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                  {label}
                                  <span className="text-[10px]">
                                    {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                  </span>
                                </button>
                              ) : label}
                            </TableHeader>
                          ))}
                          <TableHeader>
                            <span className="sr-only">Acciones</span>
                          </TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <AnimatePresence>
                          {paginatedGuests.map((guest, i) => {
                            const isSelected = selectedIds.has(guest.id)
                            return (
                              <motion.tr
                                key={guest.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ delay: i * 0.025, duration: 0.15 }}
                                className={isSelected ? 'bg-indigo-500/5' : ''}
                              >
                                <TableCell className="w-10">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const next = new Set(selectedIds)
                                      if (e.target.checked) next.add(guest.id)
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
                                  {guest.dietary_restrictions && (
                                    <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[200px]">
                                      {guest.dietary_restrictions}
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                  {guest.email ? (
                                    <p className="text-xs">{guest.email}</p>
                                  ) : null}
                                  {guest.phone ? (
                                    <p className="text-xs text-zinc-600">{guest.phone}</p>
                                  ) : null}
                                  {!guest.email && !guest.phone && (
                                    <span className="text-zinc-700">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-zinc-400">
                                  {guest.table_number || <span className="text-zinc-700">—</span>}
                                </TableCell>
                                <TableCell className="text-zinc-400 tabular-nums">
                                  {guest.guests_count ?? 1}
                                </TableCell>
                                <TableCell>
                                  <GuestStatusSelect
                                    guest={guest}
                                    eventIdentifier={event.identifier}
                                    statuses={guestStatuses}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {/* Copy RSVP link */}
                                    <button
                                      onClick={async () => {
                                        const rsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`
                                        await navigator.clipboard.writeText(rsvpUrl)
                                        toast.success('Link RSVP copiado')
                                      }}
                                      className="p-1.5 rounded-lg text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                      aria-label="Copiar link RSVP"
                                      title="Copiar link RSVP"
                                    >
                                      <LinkIcon className="size-3.5" />
                                    </button>
                                    {/* WhatsApp quick-send */}
                                    {guest.phone && (
                                      <button
                                        onClick={() => {
                                          const rsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`
                                          const msg = encodeURIComponent(
                                            `Hola ${guest.first_name}, te invitamos a "${event.name}". Confirma tu asistencia aquí: ${rsvpUrl}`
                                          )
                                          const phone = guest.phone!.replace(/\D/g, '')
                                          window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
                                        }}
                                        className="p-1.5 rounded-lg text-zinc-600 hover:text-lime-400 hover:bg-lime-500/10 transition-colors"
                                        aria-label="Enviar por WhatsApp"
                                        title="Enviar invitación por WhatsApp"
                                      >
                                        <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                        </svg>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => openEditGuest(guest)}
                                      className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                                      aria-label={`Editar a ${guest.first_name}`}
                                    >
                                      <PencilIcon className="size-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setGuestToDelete(guest)}
                                      className="p-1.5 rounded-lg text-zinc-600 hover:text-pink-400 hover:bg-pink-500/10 transition-colors"
                                      aria-label={`Eliminar a ${guest.first_name}`}
                                    >
                                      <TrashIcon className="size-3.5" />
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
                  <Pagination
                    total={filteredGuests.length}
                    page={guestPage}
                    pageSize={GUEST_PAGE_SIZE}
                    onPageChange={setGuestPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── INVITACIONES ────────────────────────────────────────────────── */}
          {activeTab === 'invitaciones' && (
            <InvitationTracker
              event={event}
              guests={guests}
              isLoading={guestsLoading}
            />
          )}

          {/* ── ASIENTOS (MESAS) ────────────────────────────────────────────── */}
          {activeTab === 'asientos' && (
            <SeatingPlan
              guests={guests}
              eventIdentifier={event.identifier}
              isLoading={guestsLoading}
            />
          )}

          {/* ── RSVP ────────────────────────────────────────────────────────── */}
          {activeTab === 'rsvp' && (
            <RSVPTracker
              eventIdentifier={event.identifier}
              guests={guests}
              isLoading={guestsLoading}
            />
          )}

          {/* ── MOMENTOS ────────────────────────────────────────────────────── */}
          {activeTab === 'momentos' && (
            <MomentsWall
              eventId={event.id}
              eventIdentifier={event.identifier}
              eventName={event.name}
            />
          )}

          {/* ── ANALÍTICAS ──────────────────────────────────────────────────── */}
          {activeTab === 'analiticas' && (
            <EventAnalyticsPanel eventId={event.id} eventIdentifier={event.identifier} />
          )}

          {/* ── CONFIGURACIÓN ───────────────────────────────────────────────── */}
          {activeTab === 'configuracion' && (
            <div className="space-y-10">
              {/* Share links */}
              <div>
                <Subheading className="mb-4">Compartir evento</Subheading>
                <EventSharePanel event={event} guests={guests} />
              </div>

              <div className="border-t border-white/10" />

              {/* Sections */}
              <div>
                <Subheading className="mb-4">Secciones de la página</Subheading>
                <p className="text-sm text-zinc-500 mb-5">
                  Define y ordena las secciones que aparecerán en la página pública del evento.
                </p>
                <EventSectionsManager eventId={event.id} />
              </div>

              <div className="border-t border-white/10" />

              {/* Design */}
              <div>
                <Subheading className="mb-4">Diseño y apariencia</Subheading>
                <p className="text-sm text-zinc-500 mb-5">
                  Selecciona la plantilla visual, paleta de colores y tipografía para la página pública del evento.
                </p>
                <EventDesignPicker eventId={event.id} />
              </div>

              <div className="border-t border-white/10" />

              {/* Config */}
              <div>
                <Subheading className="mb-4">Acceso y visibilidad</Subheading>
                <EventConfigPanel eventId={event.id} eventIdentifier={event.identifier} />
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <EventFormModal isOpen={isEditOpen} setIsOpen={setIsEditOpen} event={event} />

      <GuestFormModal
        isOpen={isGuestFormOpen}
        setIsOpen={setIsGuestFormOpen}
        eventId={event.id}
        eventIdentifier={event.identifier}
        guest={selectedGuest}
      />

      <GuestDeleteModal
        guest={guestToDelete}
        eventIdentifier={event.identifier}
        onClose={() => setGuestToDelete(null)}
      />

      <GuestBatchModal
        isOpen={isBatchOpen}
        setIsOpen={setIsBatchOpen}
        eventId={event.id}
        eventIdentifier={event.identifier}
      />
    </PageTransition>
  )
}
