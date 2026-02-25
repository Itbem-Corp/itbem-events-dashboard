'use client'

import { useEffect, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion } from 'motion/react'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { EventConfig } from '@/models/EventConfig'

import { Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Switch } from '@/components/switch'
import {
  GlobeAltIcon,
  UsersIcon,
  UserPlusIcon,
  LockClosedIcon,
  LinkIcon,
  PhotoIcon,
  ChatBubbleLeftRightIcon,
  BellAlertIcon,
  ClockIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon,
  HandRaisedIcon,
  MapPinIcon,
  Squares2X2Icon,
  NewspaperIcon,
  PhoneIcon,
  RectangleStackIcon,
} from '@heroicons/react/20/solid'

// ─── Primitives ───────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  badge?: string
}

function SettingRow({ icon: Icon, title, description, checked, onChange, disabled, badge }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 sm:gap-6 py-4">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-800">
          <Icon className="size-4 text-zinc-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-200">{title}</p>
            {badge && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="py-4 border-b border-white/5">
      <Subheading>{title}</Subheading>
      {subtitle && <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  eventIdentifier: string
}

export function EventConfigPanel({ eventId, eventIdentifier }: Props) {
  const { data: config, isLoading, error: configError } = useSWR<EventConfig>(
    eventId ? `/events/${eventId}/config` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Access & visibility
  const [isPublic, setIsPublic] = useState(false)
  const [showGuestList, setShowGuestList] = useState(false)
  const [allowRegistration, setAllowRegistration] = useState(false)
  const [passwordProtection, setPasswordProtection] = useState('')

  // Guest interaction
  const [allowUploads, setAllowUploads] = useState(false)
  const [allowMessages, setAllowMessages] = useState(false)
  const [notifyOnMomentUpload, setNotifyOnMomentUpload] = useState(false)

  // Scheduling
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')

  // Custom messages
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [thankYouMessage, setThankYouMessage] = useState('')
  const [momentMessage, setMomentMessage] = useState('')
  const [guestSignatureTitle, setGuestSignatureTitle] = useState('')

  // Section visibility toggles
  const [showCountdown, setShowCountdown] = useState(true)
  const [showRsvp, setShowRsvp] = useState(true)
  const [showLocation, setShowLocation] = useState(true)
  const [showGallery, setShowGallery] = useState(true)
  const [showWall, setShowWall] = useState(true)
  const [showContact, setShowContact] = useState(true)
  const [showSchedule, setShowSchedule] = useState(true)

  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Public URL
  const publicUrl = `${process.env.NEXT_PUBLIC_ASTRO_URL ?? 'https://www.eventiapp.com.mx'}/e/${eventIdentifier}`

  useEffect(() => {
    if (!config) return
    setIsPublic(config.is_public ?? false)
    setShowGuestList(config.show_guest_list ?? false)
    setAllowRegistration(config.allow_registration ?? false)
    setPasswordProtection(config.password_protection ?? '')
    setAllowUploads(config.allow_uploads ?? false)
    setAllowMessages(config.allow_messages ?? false)
    setNotifyOnMomentUpload(config.notify_on_moment_upload ?? false)
    setActiveFrom(config.active_from ? config.active_from.substring(0, 16) : '')
    setActiveUntil(config.active_until ? config.active_until.substring(0, 16) : '')
    setWelcomeMessage(config.welcome_message ?? '')
    setThankYouMessage(config.thank_you_message ?? '')
    setMomentMessage(config.moment_message ?? '')
    setGuestSignatureTitle(config.guest_signature_title ?? '')
    setShowCountdown(config.show_countdown ?? true)
    setShowRsvp(config.show_rsvp ?? true)
    setShowLocation(config.show_location ?? true)
    setShowGallery(config.show_gallery ?? true)
    setShowWall(config.show_wall ?? true)
    setShowContact(config.show_contact ?? true)
    setShowSchedule(config.show_schedule ?? true)
    setIsDirty(false)
  }, [config])

  const mark = () => setIsDirty(true)

  // Warn on page unload when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/events/${eventId}/config`, {
        is_public: isPublic,
        show_guest_list: showGuestList,
        allow_registration: allowRegistration,
        password_protection: passwordProtection || undefined,
        allow_uploads: allowUploads,
        allow_messages: allowMessages,
        notify_on_moment_upload: notifyOnMomentUpload,
        active_from: (activeFrom && !activeFrom.startsWith('0001-')) ? activeFrom + ':00Z' : undefined,
        active_until: (activeUntil && !activeUntil.startsWith('0001-')) ? activeUntil + ':00Z' : undefined,
        welcome_message: welcomeMessage || undefined,
        thank_you_message: thankYouMessage || undefined,
        moment_message: momentMessage || undefined,
        guest_signature_title: guestSignatureTitle || undefined,
        show_countdown: showCountdown,
        show_rsvp: showRsvp,
        show_location: showLocation,
        show_gallery: showGallery,
        show_wall: showWall,
        show_contact: showContact,
        show_schedule: showSchedule,
      })
      await mutate(`/events/${eventId}/config`)
      setIsDirty(false)
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('URL copiada al portapapeles')
    } catch {
      toast.error('No se pudo copiar la URL')
    }
  }

  if (isLoading && !configError) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-zinc-800/50 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (configError || !config) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        No se pudo cargar la configuración del evento.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Public URL */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 p-5"
      >
        <Subheading>URL pública del evento</Subheading>
        <p className="mt-1 text-sm text-zinc-500">
          Comparte este enlace con tus invitados.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 min-w-0">
            <LinkIcon className="size-4 text-zinc-500 shrink-0" />
            <span className="text-sm text-zinc-300 truncate font-mono">{publicUrl}</span>
          </div>
          <Button outline onClick={copyPublicUrl} className="shrink-0">
            Copiar
          </Button>
        </div>
      </motion.div>

      {/* ── Access & Visibility ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 divide-y divide-white/5 px-5"
      >
        <SectionHeader title="Visibilidad y acceso" />

        <SettingRow
          icon={GlobeAltIcon}
          title="Evento público"
          description="El evento es accesible sin contraseña para cualquier persona con el enlace."
          checked={isPublic}
          onChange={(v) => { setIsPublic(v); mark() }}
        />

        <SettingRow
          icon={UsersIcon}
          title="Mostrar lista de invitados"
          description="Los invitados confirmados son visibles en la página pública."
          checked={showGuestList}
          onChange={(v) => { setShowGuestList(v); mark() }}
        />

        <SettingRow
          icon={UserPlusIcon}
          title="Permitir registro"
          description="Los visitantes pueden registrarse directamente desde la página pública."
          checked={allowRegistration}
          onChange={(v) => { setAllowRegistration(v); mark() }}
        />

        {/* Password */}
        <div className="py-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-800">
              <LockClosedIcon className="size-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Contraseña de acceso</p>
              <p className="mt-0.5 text-sm text-zinc-500">Opcional. Si se establece, los invitados deberán ingresarla.</p>
            </div>
          </div>
          <Field>
            <Label className="sr-only">Contraseña</Label>
            <Input
              type="text"
              value={passwordProtection}
              onChange={(e) => { setPasswordProtection(e.target.value); mark() }}
              placeholder="Dejar vacío para no usar contraseña"
            />
          </Field>
        </div>
      </motion.div>

      {/* ── Guest Interaction ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 divide-y divide-white/5 px-5"
      >
        <SectionHeader
          title="Interacción de invitados"
          subtitle="Permite que los invitados participen en el evento."
        />

        <SettingRow
          icon={PhotoIcon}
          title="Permitir subir fotos"
          description="Los invitados podrán subir fotos y videos desde su dispositivo. Los videos no se incluyen en descargas ZIP."
          checked={allowUploads}
          onChange={(v) => { setAllowUploads(v); mark() }}
          badge="Muro"
        />

        <SettingRow
          icon={ChatBubbleLeftRightIcon}
          title="Permitir mensajes"
          description="Los invitados podrán dejar un mensaje junto con sus fotos y videos."
          checked={allowMessages}
          onChange={(v) => { setAllowMessages(v); mark() }}
          badge="Muro"
        />

        <SettingRow
          icon={BellAlertIcon}
          title="Notificar al subir momento"
          description="Recibe una notificación cuando un invitado sube un momento."
          checked={notifyOnMomentUpload}
          onChange={(v) => { setNotifyOnMomentUpload(v); mark() }}
        />
      </motion.div>

      {/* ── Scheduling ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4 space-y-4"
      >
        <SectionHeader
          title="Programar visibilidad"
          subtitle="Define cuándo la página pública del evento estará activa."
        />

        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ClockIcon className="size-4 text-zinc-500" />
              <label className="text-sm font-medium text-zinc-300">Disponible desde</label>
            </div>
            <input
              type="datetime-local"
              value={activeFrom}
              onChange={(e) => { setActiveFrom(e.target.value); mark() }}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ClockIcon className="size-4 text-zinc-500" />
              <label className="text-sm font-medium text-zinc-300">Disponible hasta</label>
            </div>
            <input
              type="datetime-local"
              value={activeUntil}
              onChange={(e) => { setActiveUntil(e.target.value); mark() }}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-600">
          Deja en blanco para que la página esté siempre disponible.
        </p>
      </motion.div>

      {/* ── Custom Messages ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4 space-y-4"
      >
        <SectionHeader
          title="Mensajes personalizados"
          subtitle="Texto que verán los invitados en diferentes momentos."
        />

        <div className="pt-2 space-y-4">
          {([
            {
              key: 'welcomeMessage',
              label: 'Mensaje de bienvenida',
              icon: ChatBubbleOvalLeftEllipsisIcon,
              placeholder: 'Bienvenido a nuestro evento, estamos felices de tenerte aquí.',
              value: welcomeMessage,
              set: setWelcomeMessage,
            },
            {
              key: 'thankYouMessage',
              label: 'Mensaje de agradecimiento (post-RSVP)',
              icon: CheckCircleIcon,
              placeholder: '¡Gracias por confirmar tu asistencia! Te esperamos.',
              value: thankYouMessage,
              set: setThankYouMessage,
            },
            {
              key: 'momentMessage',
              label: 'Invitación a compartir momentos',
              icon: PhotoIcon,
              placeholder: '¡Comparte tus fotos favoritas del evento!',
              value: momentMessage,
              set: setMomentMessage,
            },
            {
              key: 'guestSignatureTitle',
              label: 'Título para firma de invitados',
              icon: HandRaisedIcon,
              placeholder: 'Escribe tu mensaje para los novios…',
              value: guestSignatureTitle,
              set: setGuestSignatureTitle,
            },
          ] as const).map(({ key, label, icon: Icon, placeholder, value, set }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="size-4 text-zinc-500" />
                <label className="text-sm font-medium text-zinc-300">{label}</label>
              </div>
              <textarea
                value={value}
                onChange={(e) => { set(e.target.value); mark() }}
                placeholder={placeholder}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Section Visibility Toggles ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.20 }}
        className="rounded-xl border border-white/10 bg-zinc-900/50 divide-y divide-white/5 px-5"
      >
        <SectionHeader
          title="Visibilidad de bloques"
          subtitle="Controla qué bloques aparecen en la página pública del evento."
        />

        {([
          { icon: ClockIcon, title: 'Cuenta regresiva', desc: 'Timer hasta el evento', val: showCountdown, set: setShowCountdown },
          { icon: NewspaperIcon, title: 'RSVP', desc: 'Formulario de confirmación', val: showRsvp, set: setShowRsvp },
          { icon: MapPinIcon, title: 'Ubicación', desc: 'Mapa y dirección del evento', val: showLocation, set: setShowLocation },
          { icon: Squares2X2Icon, title: 'Galería', desc: 'Fotos del evento', val: showGallery, set: setShowGallery },
          { icon: PhotoIcon, title: 'Muro de momentos', desc: 'Los invitados podrán ver los momentos aprobados en la página del evento.', val: showWall, set: setShowWall },
          { icon: PhoneIcon, title: 'Contacto', desc: 'Información de contacto del organizador', val: showContact, set: setShowContact },
          { icon: RectangleStackIcon, title: 'Agenda', desc: 'Horario e itinerario', val: showSchedule, set: setShowSchedule },
        ] as const).map(({ icon: Icon, title, desc, val, set }) => (
          <SettingRow
            key={title}
            icon={Icon}
            title={title}
            description={desc}
            checked={val}
            onChange={(v) => { set(v); mark() }}
          />
        ))}
      </motion.div>

      {/* Save */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {isDirty && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-amber-400"
          >
            Tienes cambios sin guardar
          </motion.p>
        )}
        <div className="sm:ml-auto">
          <Button onClick={handleSave} disabled={saving || !isDirty} className="w-full sm:w-auto">
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </div>
    </div>
  )
}
