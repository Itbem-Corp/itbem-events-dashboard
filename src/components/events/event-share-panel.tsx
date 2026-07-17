'use client'

import { Button } from '@/components/button'
import { BrandedQR } from '@/components/ui/branded-qr'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { readApiData } from '@/lib/api-envelope'
import { eventGuestShareSummaryPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { getEffectiveStatus } from '@/lib/guest-utils'
import { getEventPublicUrl, getGuestRsvpUrl, hasGuestRsvpToken } from '@/lib/public-urls'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'
import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

import { ArrowPathIcon, DevicePhoneMobileIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/20/solid'

interface ShareLinkRowProps {
  icon: ComponentType<{ className?: string }>
  label: string
  url: string
  description?: string
}

function ShareLinkRow({ icon: Icon, label, url, description }: ShareLinkRowProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="flex flex-col justify-between gap-3 border-b border-white/5 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
          <Icon className="size-3.5 text-ink-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          <p className="mt-1 max-w-full truncate font-mono text-xs text-ink-muted">{url}</p>
        </div>
      </div>
      <button
        onClick={handleCopy}
        className={[
          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          copied ? 'bg-lime-500/20 text-lime-400' : 'bg-surface-raised text-ink-secondary hover:bg-surface-soft hover:text-ink',
        ].join(' ')}
      >
        {copied ? 'OK Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

interface Props {
  event: Event
  guests?: Guest[]
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
}

interface GuestShareSummary {
  total: number
  with_email: number
  with_phone: number
  pending_with_email: number
  first_pending?: Pick<Guest, 'id' | 'first_name' | 'email' | 'pretty_token'>
}

export function EventSharePanel({ event, guests: providedGuests, isLoading, error, onRetry }: Props) {
  const shouldFetchSummary = providedGuests === undefined
  const {
    data: rawSummary,
    isLoading: summaryLoading,
    isValidating: summaryValidating,
    error: summaryError,
    mutate: retrySummary,
  } = useSWR<unknown>(
    shouldFetchSummary ? eventGuestShareSummaryPath(event.id) : null,
    fetcher,
    {
      ...responsiveListSwrOptions,
      fallbackData: event.guest_share_summary,
      revalidateOnMount: !event.guest_share_summary,
    }
  )

  const fallbackSummary = useMemo<GuestShareSummary | undefined>(() => {
    if (!providedGuests) return undefined
    const pending = providedGuests.filter(
      (guest) => getEffectiveStatus(guest) === 'PENDING' && guest.email && hasGuestRsvpToken(guest)
    )
    return {
      total: providedGuests.length,
      with_email: providedGuests.filter((guest) => guest.email).length,
      with_phone: providedGuests.filter((guest) => guest.phone).length,
      pending_with_email: pending.length,
      first_pending: pending[0],
    }
  }, [providedGuests])
  const summary = fallbackSummary ?? event.guest_share_summary ?? readApiData<GuestShareSummary | null>(rawSummary)
  const summaryErrorState = getDataErrorState(summaryError, rawSummary)
  const loading = isLoading ?? (shouldFetchSummary && summaryLoading && !summary)
  const loadError = error ?? (summaryErrorState === 'fatal' ? summaryError : undefined)
  const hasStaleSummaryError = !error && summaryErrorState === 'stale'
  const retry = onRetry ?? (() => void retrySummary())

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Cargando datos para compartir…</span>
        <div aria-hidden="true" className="animate-pulse space-y-3 motion-reduce:animate-none">
          <div className="h-28 rounded-xl border border-white/5 bg-surface/70" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 rounded-xl border border-white/5 bg-surface/70" />
            <div className="h-20 rounded-xl border border-white/5 bg-surface/70" />
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-5">
        <p className="text-sm font-medium text-ink">
          No se pudieron cargar los datos de invitados para compartir.
        </p>
        <p className="mt-1 text-sm text-ink-muted">Las demás opciones de configuración siguen disponibles.</p>
        <Button outline className="mt-4" onClick={retry}>
          <ArrowPathIcon aria-hidden="true" className="size-4" />
          Reintentar datos
        </Button>
      </div>
    )
  }

  const eventUrl = getEventPublicUrl(event.identifier)

  const firstPendingWithEmail = summary?.first_pending
  const pendingWithEmailCount = summary?.pending_with_email ?? 0

  const openFirstPendingEmail = () => {
    const guest = firstPendingWithEmail
    if (!guest?.email) return

    const subject = encodeURIComponent(`Confirma tu asistencia - ${event.name}`)
    const rsvpUrl = getGuestRsvpUrl(guest, event.identifier)
    const body = encodeURIComponent(
      `Hola ${guest.first_name},\n\nTe recordamos confirmar tu asistencia al evento "${event.name}".\n\nConfirma aqui: ${rsvpUrl}\n\nTe esperamos!`
    )
    window.open(`mailto:${guest.email}?subject=${subject}&body=${body}`)
    if (pendingWithEmailCount > 1) {
      toast.info(`Correo abierto para ${guest.first_name}. Quedan ${pendingWithEmailCount - 1} pendientes.`)
    }
  }

  return (
    <div className="space-y-6">
      {hasStaleSummaryError && (
        <StaleDataNotice
          label="los datos para compartir"
          onRetry={retry}
          retrying={summaryValidating}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-surface/50 px-5 py-4"
      >
        <p className="mb-3 text-sm font-semibold text-ink-secondary">Links del evento</p>
        <ShareLinkRow
          icon={GlobeAltIcon}
          label="Pagina del evento"
          url={eventUrl}
          description="URL principal del evento para compartir"
        />
        <ShareLinkRow
          icon={EnvelopeIcon}
          label={firstPendingWithEmail ? `RSVP de ${firstPendingWithEmail.first_name}` : 'RSVP personalizado'}
          url={firstPendingWithEmail ? getGuestRsvpUrl(firstPendingWithEmail, event.identifier) : eventUrl}
          description={
            firstPendingWithEmail
              ? 'Cada invitado tiene un enlace propio para confirmar asistencia'
              : 'Los enlaces RSVP se generan por invitado en la pestana Invitaciones'
          }
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <div className="rounded-xl border border-white/10 bg-surface/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <EnvelopeIcon className="size-4 text-indigo-400" />
            <p className="text-xs font-medium text-ink-secondary">Con correo registrado</p>
          </div>
          <p className="text-2xl font-bold text-ink">{summary?.with_email ?? 0}</p>
          <p className="mt-0.5 text-xs text-ink-muted">de {summary?.total ?? 0} invitados</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <DevicePhoneMobileIcon className="size-4 text-indigo-400" />
            <p className="text-xs font-medium text-ink-secondary">Con telefono registrado</p>
          </div>
          <p className="text-2xl font-bold text-ink">{summary?.with_phone ?? 0}</p>
          <p className="mt-0.5 text-xs text-ink-muted">de {summary?.total ?? 0} invitados</p>
        </div>
      </motion.div>

      {pendingWithEmailCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <EnvelopeIcon className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-300">{pendingWithEmailCount} pendientes con correo</p>
              <p className="mt-1 text-xs text-ink-secondary">
                Hay {pendingWithEmailCount} invitados pendientes con correo y enlace RSVP personal. Abre el primero y
                repite desde Invitaciones para los demas.
              </p>
              <button
                onClick={openFirstPendingEmail}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-400 transition-colors hover:text-amber-300"
              >
                <EnvelopeIcon className="size-3.5" />
                Abrir correo del primer pendiente
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="rounded-xl border border-white/10 bg-surface/50 p-6"
      >
        <p className="mb-2 text-sm font-semibold text-ink-secondary">Codigo QR del evento</p>
        <p className="mb-5 text-xs text-ink-muted">
          Los invitados pueden escanear este codigo para acceder directamente al evento.
        </p>
        <BrandedQR
          value={eventUrl}
          title={event.name}
          subtitle="Escanea para ver el evento"
          downloadName={`qr-${event.identifier}`}
          size={160}
          dark
        />
      </motion.div>
    </div>
  )
}
