'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import type { Guest } from '@/models/Guest'
import type { Event } from '@/models/Event'

import { EmptyState } from '@/components/ui/empty-state'
import { BrandedQR } from '@/components/ui/branded-qr'
import {
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  GlobeAltIcon,
  PhoneArrowUpRightIcon,
  UsersIcon,
  LinkIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  QrCodeIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/20/solid'
import { api } from '@/lib/api'

const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getRsvpStatus(guest: Guest) {
  const code = guest.rsvp_status ?? guest.status?.code ?? 'PENDING'
  switch (code.toUpperCase()) {
    case 'CONFIRMED':
      return { label: 'Confirmado', color: 'text-lime-400 bg-lime-500/10 border-lime-500/20', icon: CheckCircleIcon }
    case 'DECLINED':
      return { label: 'Declinado', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20', icon: XCircleIcon }
    default:
      return { label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: ClockIcon }
  }
}

function getMethodIcon(method?: string) {
  switch (method?.toLowerCase()) {
    case 'web':    return { icon: GlobeAltIcon, label: 'Web', color: 'text-indigo-400' }
    case 'app':    return { icon: PhoneArrowUpRightIcon, label: 'App', color: 'text-violet-400' }
    case 'host':   return { icon: UsersIcon, label: 'Host', color: 'text-amber-400' }
    default:       return null
  }
}

type FilterType = 'ALL' | 'CONFIRMED' | 'DECLINED' | 'PENDING'

// ─── Stats ────────────────────────────────────────────────────────────────────

function InvitationStats({ guests }: { guests: Guest[] }) {
  const confirmed  = guests.filter((g) => (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === 'CONFIRMED')
  const declined   = guests.filter((g) => (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === 'DECLINED')
  const pending    = guests.filter((g) => !['CONFIRMED', 'DECLINED'].includes((g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase()))
  const withPhone  = guests.filter((g) => g.phone)
  const withEmail  = guests.filter((g) => g.email)
  const responded  = confirmed.length + declined.length
  const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0

  const stats = [
    { label: 'Total invitaciones',     value: guests.length,     color: 'text-zinc-100' },
    { label: 'Confirmaron',            value: confirmed.length,  color: 'text-lime-400' },
    { label: 'Declinaron',             value: declined.length,   color: 'text-pink-400' },
    { label: 'Sin respuesta',          value: pending.length,    color: 'text-amber-400' },
    { label: 'Con teléfono',           value: withPhone.length,  color: 'text-indigo-400' },
    { label: 'Con correo',             value: withEmail.length,  color: 'text-violet-400' },
  ]

  return (
    <div className="space-y-4">
      {/* Response rate bar */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-zinc-300">Tasa de respuesta</p>
          <span className="text-2xl font-bold text-indigo-400 tabular-nums">{responseRate}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${responseRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span><span className="text-lime-400 font-medium">{confirmed.length}</span> confirmados</span>
          <span><span className="text-pink-400 font-medium">{declined.length}</span> declinados</span>
          <span><span className="text-amber-400 font-medium">{pending.length}</span> pendientes</span>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        {stats.map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/10 bg-zinc-900/50 p-4"
          >
            <p className="text-xs text-zinc-600 uppercase font-semibold tracking-wide">{s.label}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── QR Dialog ────────────────────────────────────────────────────────────────

function QRDialog({
  guestName,
  rsvpUrl,
  onClose,
}: {
  guestName: string
  rsvpUrl: string
  onClose: () => void
}) {
  const copyLink = async () => {
    await navigator.clipboard.writeText(rsvpUrl)
    toast.success('Link copiado')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-4"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          aria-label="Cerrar"
        >
          <XMarkIcon className="size-4" />
        </button>

        <BrandedQR
          value={rsvpUrl}
          title="Invitación personal"
          subtitle="Presenta este QR en la entrada"
          caption={guestName}
          downloadName={`invitacion-${guestName.replace(/\s+/g, '-').toLowerCase()}`}
          size={180}
          dark
        />

        <div className="space-y-2 pt-2">
          <p className="text-xs text-zinc-600 text-center break-all px-2">{rsvpUrl}</p>
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <ClipboardDocumentIcon className="size-3.5" />
            Copiar link
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Guest Row ────────────────────────────────────────────────────────────────

interface GuestInvitationRowProps {
  guest: Guest
  event: Event
  index: number
}

function GuestInvitationRow({ guest, event, index }: GuestInvitationRowProps) {
  const rsvp = getRsvpStatus(guest)
  const RsvpIcon = rsvp.icon
  const method = getMethodIcon(guest.rsvp_method)
  const rsvpUrl = `${PUBLIC_FRONTEND_URL}/evento?token=invitation_${guest.id}`
  const [resending, setResending] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const resend = async () => {
    if (!guest.invitation_id || resending) return
    setResending(true)
    try {
      await api.post(`/invitations/${guest.invitation_id}/resend`)
      toast.success('Reenvío registrado')
    } catch {
      toast.error('Error al registrar el reenvío')
    } finally {
      setResending(false)
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(rsvpUrl)
    toast.success('Link copiado')
  }

  const sendWhatsApp = () => {
    if (!guest.phone) return
    const eventRsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`
    const msg = encodeURIComponent(
      `Hola ${guest.first_name}, tienes una invitación para "${event.name}". Confirma tu asistencia aquí: ${eventRsvpUrl}`
    )
    const phone = guest.phone.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  const sendEmail = () => {
    if (!guest.email) return
    const eventRsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`
    const subject = encodeURIComponent(`Tu invitación — ${event.name}`)
    const body = encodeURIComponent(
      `Hola ${guest.first_name},\n\nEstás invitado/a a "${event.name}".\n\nConfirma tu asistencia aquí: ${eventRsvpUrl}\n\n¡Te esperamos!`
    )
    window.open(`mailto:${guest.email}?subject=${subject}&body=${body}`)
  }

  return (
    <>
    {showQR && (
      <AnimatePresence>
        <QRDialog
          guestName={`${guest.first_name} ${guest.last_name}`}
          rsvpUrl={rsvpUrl}
          onClose={() => setShowQR(false)}
        />
      </AnimatePresence>
    )}
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.15 }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3.5 hover:border-white/20 transition-colors"
    >
      {/* Guest info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-zinc-100">
            {guest.first_name} {guest.last_name}
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${rsvp.color}`}>
            <RsvpIcon className="size-3" />
            {rsvp.label}
          </span>
          {method && (
            <span className={`text-xs ${method.color}`} title={`Respondió vía ${method.label}`}>
              {method.label}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {guest.email && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <EnvelopeIcon className="size-3" />
              {guest.email}
            </span>
          )}
          {guest.phone && (
            <span className="flex items-center gap-1 text-xs text-zinc-600">
              <DevicePhoneMobileIcon className="size-3" />
              {guest.phone}
            </span>
          )}
        </div>

        {/* RSVP detail */}
        {guest.rsvp_at && (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-600">
            <span>Respondió: <span className="text-zinc-400">{formatDateTime(guest.rsvp_at)}</span></span>
            {guest.rsvp_guest_count != null && guest.rsvp_guest_count > 0 && (
              <span>+1s: <span className="text-zinc-400">{guest.rsvp_guest_count}</span></span>
            )}
          </div>
        )}

        {guest.max_guests != null && (
          <p className="mt-0.5 text-xs text-zinc-700">
            Cupo máximo: {guest.max_guests} persona{guest.max_guests !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setShowQR(true)}
          className="p-2 rounded-lg text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          aria-label="Ver QR de invitación"
          title="Ver código QR"
        >
          <QrCodeIcon className="size-4" />
        </button>
        <button
          onClick={copyLink}
          className="p-2 rounded-lg text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          aria-label="Copiar link"
          title="Copiar link de invitación"
        >
          <LinkIcon className="size-4" />
        </button>

        {guest.phone && (
          <button
            onClick={sendWhatsApp}
            className="p-2 rounded-lg text-zinc-600 hover:text-lime-400 hover:bg-lime-500/10 transition-colors"
            aria-label="Enviar por WhatsApp"
            title="Enviar por WhatsApp"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </button>
        )}

        {guest.email && (
          <button
            onClick={sendEmail}
            className="p-2 rounded-lg text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            aria-label="Enviar por correo"
            title="Enviar por correo"
          >
            <EnvelopeIcon className="size-4" />
          </button>
        )}

        {guest.invitation_id && (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="p-2 rounded-lg text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
            aria-label="Registrar reenvío"
            title="Registrar reenvío de invitación"
          >
            <ArrowPathIcon className={`size-4 ${resending ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </motion.div>
    </>
  )
}

// ─── Bulk WhatsApp ────────────────────────────────────────────────────────────

function BulkWhatsAppPanel({ guests, event, filter }: { guests: Guest[]; event: Event; filter: FilterType }) {
  const targets = useMemo(() => {
    const statusFilter = filter === 'ALL' ? undefined : filter
    return guests.filter((g) => {
      if (!g.phone) return false
      if (!statusFilter) return true
      return (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === statusFilter
    })
  }, [guests, filter])

  const eventRsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`

  const sendAll = () => {
    if (targets.length === 0) return
    // Open first one — browser limitation prevents mass open
    const first = targets[0]
    const msg = encodeURIComponent(
      `Hola ${first.first_name}, tienes una invitación para "${event.name}". Confirma tu asistencia: ${eventRsvpUrl}`
    )
    const phone = first.phone!.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    if (targets.length > 1) {
      toast.info(`Abriendo WhatsApp para ${first.first_name}. Repite para los demás ${targets.length - 1} invitados.`)
    }
  }

  if (targets.length === 0) return null

  return (
    <div className="rounded-xl border border-lime-500/20 bg-lime-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-lime-300">
          {targets.length} invitados con teléfono{filter !== 'ALL' ? ` (${filter.toLowerCase()})` : ''}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Envía el link de RSVP por WhatsApp a cada uno.
        </p>
      </div>
      <button
        onClick={sendAll}
        className="shrink-0 flex items-center gap-2 rounded-lg bg-lime-500/20 px-3 py-2 text-sm font-medium text-lime-400 hover:bg-lime-500/30 transition-colors"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Enviar WhatsApp
      </button>
    </div>
  )
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportInvitationsCSV(guests: Guest[], event: Event) {
  const headers = ['Nombre', 'Email', 'Teléfono', 'Estado RSVP', 'Fecha respuesta', 'Método', 'Acompañantes']
  const rows = guests.map((g) => [
    `${g.first_name} ${g.last_name}`,
    g.email ?? '',
    g.phone ?? '',
    g.rsvp_status ?? g.status?.code ?? 'PENDING',
    g.rsvp_at ? formatDateTime(g.rsvp_at) : '',
    g.rsvp_method ?? '',
    String(g.rsvp_guest_count ?? ''),
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `invitaciones-${event.name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  event: Event
  guests: Guest[]
  isLoading: boolean
}

export function InvitationTracker({ event, guests, isLoading }: Props) {
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [search, setSearch] = useState('')

  const filteredGuests = useMemo(() => {
    return guests
      .filter((g) => {
        const statusCode = (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase()
        const matchesFilter = filter === 'ALL' || statusCode === filter
        const matchesSearch = !search ||
          `${g.first_name} ${g.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          (g.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (g.phone ?? '').includes(search)
        return matchesFilter && matchesSearch
      })
      .sort((a, b) => {
        // Sort: responded first, then by name
        const aResponded = !!a.rsvp_at
        const bResponded = !!b.rsvp_at
        if (aResponded !== bResponded) return bResponded ? 1 : -1
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      })
  }, [guests, filter, search])

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-24 bg-zinc-800/50 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-xl" />)}
        </div>
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-xl" />)}
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

  const FILTER_OPTS: { id: FilterType; label: string }[] = [
    { id: 'ALL',       label: 'Todos'      },
    { id: 'PENDING',   label: 'Pendientes' },
    { id: 'CONFIRMED', label: 'Confirmados'},
    { id: 'DECLINED',  label: 'Declinados' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats */}
      <InvitationStats guests={guests} />

      {/* Bulk WhatsApp */}
      <BulkWhatsAppPanel guests={guests} event={event} filter={filter} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Filter tabs */}
        <div className="flex rounded-lg overflow-hidden border border-white/10 w-full sm:w-auto">
          {FILTER_OPTS.map((opt) => {
            const count = opt.id === 'ALL' ? guests.length :
              guests.filter((g) => (g.rsvp_status ?? g.status?.code ?? 'PENDING').toUpperCase() === opt.id).length
            return (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                className={[
                  'flex flex-1 sm:flex-initial items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors',
                  filter === opt.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                ].join(' ')}
              >
                <FunnelIcon className="size-3 hidden sm:block" />
                {opt.label}
                <span className={[
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  filter === opt.id ? 'bg-white/20' : 'bg-zinc-800 text-zinc-500',
                ].join(' ')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + Export row */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <input
            type="search"
            placeholder="Buscar invitado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 sm:py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <button
            onClick={() => exportInvitationsCSV(guests, event)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 sm:py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-zinc-600">
        Mostrando {filteredGuests.length} de {guests.length} invitados
      </p>

      {/* Guest list */}
      {filteredGuests.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-600">
          Ningún invitado coincide con los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredGuests.map((guest, i) => (
              <GuestInvitationRow key={guest.id} guest={guest} event={event} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
