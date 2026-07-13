'use client'

import type { Event } from '@/models/Event'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'
import type { GuestSummary } from '@/models/GuestSummary'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trackProductEvent } from '@/lib/product-analytics'

import { BrandedQR } from '@/components/ui/branded-qr'
import { EmptyState } from '@/components/ui/empty-state'
import { PageDataError } from '@/components/ui/page-data-error'
import { Pagination } from '@/components/ui/pagination'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useDebounce } from '@/hooks/useDebounce'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  eventGuestsExportPath,
  eventInvitationsPagePath,
  guestRsvpTokenPath,
  invitationResendPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { mergeGuestCacheUpdate, upsertGuestCacheValue } from '@/lib/guest-cache'
import { getEffectiveStatus, getGuestCompanionCount, getGuestRsvpAt, getGuestRsvpMethod } from '@/lib/guest-utils'
import { getGuestRsvpUrl, hasGuestRsvpToken } from '@/lib/public-urls'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  FunnelIcon,
  GlobeAltIcon,
  LinkIcon,
  PhoneArrowUpRightIcon,
  QrCodeIcon,
  UsersIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import useSWR, { preload } from 'swr'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getRsvpStatus(guest: Guest) {
  switch (getEffectiveStatus(guest)) {
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
    case 'web':
      return { icon: GlobeAltIcon, label: 'Web', color: 'text-indigo-400' }
    case 'app':
      return { icon: PhoneArrowUpRightIcon, label: 'App', color: 'text-violet-400' }
    case 'host':
      return { icon: UsersIcon, label: 'Host', color: 'text-amber-400' }
    default:
      return null
  }
}

type FilterType = 'ALL' | 'CONFIRMED' | 'DECLINED' | 'PENDING'
const INVITATIONS_PAGE_SIZE = 25

// ─── Stats ────────────────────────────────────────────────────────────────────

interface GuestShareSummary {
  total: number
  with_email: number
  with_phone: number
  pending_with_email: number
}

function InvitationStats({ summary, shareSummary }: { summary: GuestSummary; shareSummary: GuestShareSummary | null }) {
  const responded = summary.confirmed + summary.declined
  const responseRate = summary.total > 0 ? Math.round((responded / summary.total) * 100) : 0

  const stats = [
    { label: 'Total invitaciones', value: summary.total, color: 'text-zinc-100' },
    { label: 'Confirmaron', value: summary.confirmed, color: 'text-lime-400' },
    { label: 'Declinaron', value: summary.declined, color: 'text-pink-400' },
    { label: 'Sin respuesta', value: summary.pending, color: 'text-amber-400' },
    { label: 'Con teléfono', value: shareSummary?.with_phone ?? '—', color: 'text-indigo-400' },
    { label: 'Con correo', value: shareSummary?.with_email ?? '—', color: 'text-violet-400' },
  ]

  return (
    <div className="space-y-4">
      {/* Response rate bar */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-300">Tasa de respuesta</p>
          <span className="text-2xl font-bold text-indigo-400 tabular-nums">{responseRate}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${responseRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span>
            <span className="font-medium text-lime-400">{summary.confirmed}</span> confirmados
          </span>
          <span>
            <span className="font-medium text-pink-400">{summary.declined}</span> declinados
          </span>
          <span>
            <span className="font-medium text-amber-400">{summary.pending}</span> pendientes
          </span>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {stats.map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/10 bg-zinc-900/50 p-4"
          >
            <p className="text-xs font-semibold tracking-wide text-zinc-600 uppercase">{s.label}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── QR Dialog ────────────────────────────────────────────────────────────────

function QRDialog({ guestName, rsvpUrl, onClose }: { guestName: string; rsvpUrl: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(rsvpUrl)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-dialog-title"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.16 }}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/45"
      >
        <h2 id="qr-dialog-title" className="sr-only">
          Código QR de invitación para {guestName}
        </h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:outline-none"
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
          <p className="px-2 text-center text-xs break-all text-zinc-600">{rsvpUrl}</p>
          <button
            type="button"
            onClick={copyLink}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:outline-none"
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
  onGuestUpdated: (guest: Guest) => Promise<void>
}

function GuestInvitationRow({ guest, event, index, onGuestUpdated }: GuestInvitationRowProps) {
  const rsvp = getRsvpStatus(guest)
  const RsvpIcon = rsvp.icon
  const rsvpAt = getGuestRsvpAt(guest)
  const method = getMethodIcon(getGuestRsvpMethod(guest))
  const hasPersonalLink = hasGuestRsvpToken(guest)
  const rsvpUrl = hasPersonalLink ? getGuestRsvpUrl(guest, event.identifier) : ''
  const [resending, setResending] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const generatePersonalLink = async () => {
    if (generatingLink) return
    setGeneratingLink(true)
    try {
      const response = await api.post(guestRsvpTokenPath(guest.id))
      const updatedGuest = readApiData<Guest>(response.data)
      if (!hasGuestRsvpToken(updatedGuest)) throw new Error('Token RSVP empty')
      const mergedGuest = mergeGuestCacheUpdate(updatedGuest, guest)
      await onGuestUpdated(mergedGuest)
      toast.success('Link RSVP generado')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No se pudo generar el link RSVP'))
    } finally {
      setGeneratingLink(false)
    }
  }

  const resend = async () => {
    if (!guest.invitation_id || resending) return
    setResending(true)
    try {
      await api.post(invitationResendPath(guest.invitation_id))
      trackProductEvent('invitation_handoff', { channel: 'resend' })
      toast.success('Reenvío registrado')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Error al registrar el reenvío'))
    } finally {
      setResending(false)
    }
  }

  const copyLink = async () => {
    if (!hasPersonalLink) {
      toast.error('Este invitado no tiene token RSVP generado')
      return
    }
    try {
      await navigator.clipboard.writeText(rsvpUrl)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  const sendWhatsApp = () => {
    if (!guest.phone || !hasPersonalLink) return
    const eventRsvpUrl = rsvpUrl
    const msg = encodeURIComponent(
      `Hola ${guest.first_name}, tienes una invitación para "${event.name}". Confirma tu asistencia aquí: ${eventRsvpUrl}`
    )
    const phone = guest.phone.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  const sendEmail = () => {
    if (!guest.email || !hasPersonalLink) return
    const eventRsvpUrl = rsvpUrl
    const subject = encodeURIComponent(`Tu invitación — ${event.name}`)
    const body = encodeURIComponent(
      `Hola ${guest.first_name},\n\nEstás invitado/a a "${event.name}".\n\nConfirma tu asistencia aquí: ${eventRsvpUrl}\n\n¡Te esperamos!`
    )
    window.open(`mailto:${guest.email}?subject=${subject}&body=${body}`)
  }

  return (
    <>
      {showQR && hasPersonalLink && (
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
        transition={{ delay: Math.min(index, 6) * 0.015, duration: 0.15 }}
        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3.5 transition-colors hover:border-white/20 sm:flex-row sm:items-center"
      >
        {/* Guest info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-zinc-100">
              {guest.first_name} {guest.last_name}
            </p>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${rsvp.color}`}
            >
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
          {rsvpAt && (
            <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-600">
              <span>
                Respondió: <span className="text-zinc-400">{formatDateTime(rsvpAt)}</span>
              </span>
              {getGuestCompanionCount(guest) > 0 && (
                <span>
                  +1s: <span className="text-zinc-400">{getGuestCompanionCount(guest)}</span>
                </span>
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
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {!hasPersonalLink && (
            <button
              type="button"
              onClick={generatePersonalLink}
              disabled={generatingLink}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-2 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:cursor-wait disabled:opacity-60"
              aria-label="Generar link RSVP"
            >
              <ArrowPathIcon className={`size-3.5 ${generatingLink ? 'animate-spin' : ''}`} />
              {generatingLink ? 'Generando…' : 'Generar link'}
            </button>
          )}
          <button
            onClick={() =>
              hasPersonalLink ? setShowQR(true) : toast.error('Este invitado no tiene token RSVP generado')
            }
            disabled={!hasPersonalLink}
            className="flex size-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-violet-500/10 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Ver QR de invitación"
            title="Ver código QR"
          >
            <QrCodeIcon className="size-4" />
          </button>
          <button
            onClick={copyLink}
            disabled={!hasPersonalLink}
            className="flex size-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Copiar link"
            title="Copiar link de invitación"
          >
            <LinkIcon className="size-4" />
          </button>

          {guest.phone && hasPersonalLink && (
            <button
              onClick={sendWhatsApp}
              className="flex size-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-lime-500/10 hover:text-lime-400"
              aria-label="Enviar por WhatsApp"
              title="Enviar por WhatsApp"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </button>
          )}

          {guest.email && hasPersonalLink && (
            <button
              onClick={sendEmail}
              className="flex size-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400"
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
              className="hidden size-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40 sm:flex"
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
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())
  const targets = useMemo(() => {
    const statusFilter = filter === 'ALL' ? undefined : filter
    return guests.filter((g) => {
      if (!g.phone || !hasGuestRsvpToken(g)) return false
      if (!statusFilter) return true
      return getEffectiveStatus(g) === statusFilter
    })
  }, [guests, filter])

  useEffect(() => {
    setHandledIds(new Set())
  }, [guests, filter])

  const remainingTargets = targets.filter((guest) => !handledIds.has(guest.id))

  const openNext = () => {
    if (remainingTargets.length === 0) return
    // Open first one — browser limitation prevents mass open
    const first = remainingTargets[0]
    const eventRsvpUrl = getGuestRsvpUrl(first, event.identifier)
    const msg = encodeURIComponent(
      `Hola ${first.first_name}, tienes una invitación para "${event.name}". Confirma tu asistencia: ${eventRsvpUrl}`
    )
    const phone = first.phone!.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    setHandledIds((current) => new Set(current).add(first.id))
    trackProductEvent('invitation_handoff', { channel: 'whatsapp' })
    toast.success(`WhatsApp preparado para ${first.first_name}`)
  }

  if (targets.length === 0) return null

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-lime-500/20 bg-lime-500/5 p-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-medium text-lime-300">{remainingTargets.length} por preparar en esta página</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Abre un mensaje personal a la vez para evitar bloqueos del navegador.
        </p>
      </div>
      <button
        onClick={openNext}
        disabled={remainingTargets.length === 0}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-lime-500/20 px-3 py-2 text-sm font-medium text-lime-400 transition-colors hover:bg-lime-500/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        {handledIds.size > 0 ? 'Abrir siguiente' : 'Abrir WhatsApp'}
      </button>
    </div>
  )
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  event: Event
  summary: GuestSummary | null
}

const EMPTY_SUMMARY: GuestSummary = { total: 0, confirmed: 0, pending: 0, declined: 0, total_attendees: 0 }

export function InvitationTracker({ event, summary }: Props) {
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exportingCSV, setExportingCSV] = useState(false)
  const debouncedSearch = useDebounce(search, 200)
  const effectiveSummary = summary ?? EMPTY_SUMMARY
  const guestsKey = eventInvitationsPagePath(event.id, {
    page,
    page_size: INVITATIONS_PAGE_SIZE,
    search: debouncedSearch,
    filter,
    sort: 'name',
    direction: 'asc',
  })
  const {
    data: rawGuests,
    error: guestsError,
    isLoading: guestsLoading,
    isValidating: guestsValidating,
    mutate: retryGuests,
  } = useSWR<CheckinGuestsPageResponse>(guestsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const guestsPage = useMemo(() => readApiData<CheckinGuestsPageResponse | undefined>(rawGuests), [rawGuests])
  const visibleGuests = useMemo(() => guestsPage?.data ?? [], [guestsPage])
  const filteredTotal = guestsPage?.total ?? 0
  const shareSummary: GuestShareSummary | null = guestsPage?.share_summary ?? null
  const guestsErrorState = getDataErrorState(guestsError, rawGuests)
  const updateInvitationGuest = useCallback(
    async (updatedGuest: Guest) => {
      await retryGuests(
        (current) => upsertGuestCacheValue(current ?? rawGuests, updatedGuest) as CheckinGuestsPageResponse,
        { revalidate: false }
      )
    },
    [rawGuests, retryGuests]
  )
  const isLoading = guestsLoading && !guestsPage
  const isSearchPending = debouncedSearch !== search || guestsValidating

  const exportInvitationsCSV = useCallback(async () => {
    if (filteredTotal === 0 || exportingCSV) return
    setExportingCSV(true)
    try {
      const response = await api.get<Blob>(
        eventGuestsExportPath(event.id, {
          search: debouncedSearch,
          filter,
          sort: 'name',
          direction: 'asc',
          view: 'invitations',
        }),
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invitaciones-${event.name
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(
        `${filteredTotal} invitación${filteredTotal !== 1 ? 'es' : ''} exportada${filteredTotal !== 1 ? 's' : ''}`
      )
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No pudimos exportar las invitaciones'))
    } finally {
      setExportingCSV(false)
    }
  }, [debouncedSearch, event.id, event.name, exportingCSV, filter, filteredTotal])

  useEffect(() => {
    const pageCount = Math.ceil(filteredTotal / INVITATIONS_PAGE_SIZE)
    if (page >= pageCount) return
    const nextPath = eventInvitationsPagePath(event.id, {
      page: page + 1,
      page_size: INVITATIONS_PAGE_SIZE,
      search: debouncedSearch,
      filter,
      sort: 'name',
      direction: 'asc',
    })
    void Promise.resolve(preload(nextPath, fetcher)).catch(() => undefined)
  }, [debouncedSearch, event.id, filter, filteredTotal, page])

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-24 rounded-xl bg-zinc-800/50" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-zinc-800/50" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-zinc-800/50" />
        ))}
      </div>
    )
  }

  if (guestsErrorState === 'fatal') {
    return (
      <PageDataError
        title="No pudimos cargar las invitaciones"
        description="La lista de invitados no está disponible en este momento."
        onRetry={() => void retryGuests()}
        retrying={guestsValidating}
      />
    )
  }

  if (effectiveSummary.total === 0 && rawGuests) {
    return (
      <EmptyState
        icon={EnvelopeIcon}
        title="Sin invitaciones"
        description="Las invitaciones aparecerán aquí cuando agregues invitados al evento."
      />
    )
  }

  const FILTER_OPTS: { id: FilterType; label: string }[] = [
    { id: 'ALL', label: 'Todos' },
    { id: 'PENDING', label: 'Pendientes' },
    { id: 'CONFIRMED', label: 'Confirmados' },
    { id: 'DECLINED', label: 'Declinados' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats */}
      <InvitationStats summary={effectiveSummary} shareSummary={shareSummary} />

      {/* Bulk WhatsApp */}
      <BulkWhatsAppPanel guests={visibleGuests} event={event} filter={filter} />

      {guestsErrorState === 'stale' && (
        <StaleDataNotice label="las invitaciones" onRetry={() => void retryGuests()} retrying={guestsValidating} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Filter tabs */}
        <div
          className="flex w-full overflow-hidden rounded-lg border border-white/10 sm:w-auto"
          role="group"
          aria-label="Filtrar invitaciones por respuesta"
        >
          {FILTER_OPTS.map((opt) => {
            const count =
              opt.id === 'ALL'
                ? effectiveSummary.total
                : opt.id === 'CONFIRMED'
                  ? effectiveSummary.confirmed
                  : opt.id === 'DECLINED'
                    ? effectiveSummary.declined
                    : effectiveSummary.pending
            return (
              <button
                type="button"
                key={opt.id}
                aria-pressed={filter === opt.id}
                onClick={() => {
                  setFilter(opt.id)
                  setPage(1)
                }}
                className={[
                  'flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors sm:flex-initial sm:gap-1.5 sm:px-3 sm:py-1.5',
                  filter === opt.id ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                ].join(' ')}
              >
                <FunnelIcon className="hidden size-3 sm:block" />
                {opt.label}
                <span
                  className={[
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    filter === opt.id ? 'bg-white/20' : 'bg-zinc-800 text-zinc-500',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + Export row */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="search"
            aria-label="Buscar invitado"
            placeholder="Buscar invitado…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-busy={isSearchPending}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:py-1.5"
          />

          <button
            onClick={() => void exportInvitationsCSV()}
            disabled={exportingCSV || filteredTotal === 0}
            aria-label="CSV completo"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            <span className="sr-only sm:not-sr-only">{exportingCSV ? 'Exportando…' : 'CSV completo'}</span>
          </button>
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-zinc-600">
        Mostrando {visibleGuests.length} de {filteredTotal} resultados ({effectiveSummary.total} invitados)
      </p>

      {/* Guest list */}
      {filteredTotal === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-600">
          Ningún invitado coincide con los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {visibleGuests.map((guest, i) => (
              <GuestInvitationRow
                key={guest.id}
                guest={guest}
                event={event}
                index={i}
                onGuestUpdated={updateInvitationGuest}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      <Pagination total={filteredTotal} page={page} pageSize={INVITATIONS_PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}
