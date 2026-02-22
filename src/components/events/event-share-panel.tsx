'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import type { Event } from '@/models/Event'
import type { Guest } from '@/models/Guest'

import {
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/20/solid'

const PUBLIC_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://itbem.events'

interface ShareLinkRowProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  url: string
  description?: string
}

function ShareLinkRow({ icon: Icon, label, url, description }: ShareLinkRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
          <Icon className="size-3.5 text-zinc-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
          <p className="text-xs text-zinc-600 font-mono mt-1 truncate max-w-[180px] sm:max-w-[300px]">{url}</p>
        </div>
      </div>
      <button
        onClick={handleCopy}
        className={[
          'shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          copied
            ? 'bg-lime-500/20 text-lime-400'
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
        ].join(' ')}
      >
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

interface Props {
  event: Event
  guests: Guest[]
}

export function EventSharePanel({ event, guests }: Props) {
  const eventUrl = `${PUBLIC_FRONTEND_URL}/e/${event.identifier}`
  const rsvpUrl = `${PUBLIC_FRONTEND_URL}/rsvp/${event.identifier}`

  const downloadQR = () => {
    const canvasEl = document.getElementById(
      `qr-download-canvas-${event.id}`
    ) as HTMLCanvasElement | null
    if (!canvasEl) return
    const url = canvasEl.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-${event.identifier}.png`
    a.click()
  }

  const confirmedWithEmail = guests.filter(
    (g) => g.status?.code === 'CONFIRMED' && g.email
  )
  const pendingWithEmail = guests.filter(
    (g) => g.status?.code === 'PENDING' && g.email
  )

  return (
    <div className="space-y-6">
      {/* Event links */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4"
      >
        <p className="text-sm font-semibold text-zinc-300 mb-3">Links del evento</p>
        <ShareLinkRow
          icon={GlobeAltIcon}
          label="Página del evento"
          url={eventUrl}
          description="URL principal del evento para compartir"
        />
        <ShareLinkRow
          icon={EnvelopeIcon}
          label="Portal de RSVP"
          url={rsvpUrl}
          description="Enlace para que los invitados confirmen asistencia"
        />
      </motion.div>

      {/* Stats summary for sharing */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="grid grid-cols-2 gap-3"
      >
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <EnvelopeIcon className="size-4 text-indigo-400" />
            <p className="text-xs font-medium text-zinc-300">Con correo registrado</p>
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {guests.filter((g) => g.email).length}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">de {guests.length} invitados</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DevicePhoneMobileIcon className="size-4 text-indigo-400" />
            <p className="text-xs font-medium text-zinc-300">Con teléfono registrado</p>
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {guests.filter((g) => g.phone).length}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">de {guests.length} invitados</p>
        </div>
      </motion.div>

      {/* Quick compose email hint */}
      {pendingWithEmail.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <EnvelopeIcon className="size-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">
                {pendingWithEmail.length} pendientes con correo
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Hay {pendingWithEmail.length} invitados pendientes con correo registrado que aún no han respondido.
                Puedes contactarles directamente con el link de RSVP.
              </p>
              <button
                onClick={() => {
                  const emails = pendingWithEmail.map((g) => g.email).join(';')
                  const subject = encodeURIComponent(`Confirma tu asistencia — ${event.name}`)
                  const body = encodeURIComponent(
                    `Hola,\n\nTe recordamos confirmar tu asistencia al evento "${event.name}".\n\nConfirma aquí: ${rsvpUrl}\n\n¡Te esperamos!`
                  )
                  window.open(`mailto:${emails}?subject=${subject}&body=${body}`)
                }}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
              >
                <EnvelopeIcon className="size-3.5" />
                Abrir correo con todos los pendientes
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* QR code */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 p-5"
      >
        <p className="text-sm font-medium text-zinc-300 mb-4">Código QR del evento</p>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Visible QR (SVG) */}
          <div className="rounded-xl overflow-hidden bg-white p-3 inline-block shrink-0">
            <QRCodeSVG
              value={eventUrl}
              size={160}
              bgColor="#ffffff"
              fgColor="#18181b"
              level="M"
            />
          </div>

          <div className="flex-1 space-y-3 w-full sm:w-auto">
            <p className="text-xs text-zinc-500">
              Los invitados pueden escanear este código para acceder al evento.
            </p>
            <button
              onClick={downloadQR}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-zinc-800 border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
            >
              <ArrowDownTrayIcon className="size-4" />
              Descargar QR
            </button>
          </div>
        </div>

        {/* Hidden high-res canvas used for PNG download */}
        <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
          <QRCodeCanvas
            id={`qr-download-canvas-${event.id}`}
            value={eventUrl}
            size={512}
            bgColor="#ffffff"
            fgColor="#18181b"
            level="M"
          />
        </div>
      </motion.div>
    </div>
  )
}
