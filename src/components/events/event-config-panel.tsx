'use client'

import { fetcher } from '@/lib/fetcher'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventConfigPath } from '@/lib/api-paths'
import { GO_ZERO_RFC3339, isLocalDateTimeRangeInvalid, toDateTimeLocalValue, toRFC3339 } from '@/lib/date-time'
import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  patchEventConfigIntoEventCacheValue,
  replaceEventConfigCacheValue,
} from '@/lib/event-config-cache'
import { getEventConfigMomentWallState, resolveEventConfigMomentWallPublished } from '@/lib/event-config-moment-wall'
import { normalizeEventConfigPatch } from '@/lib/event-config-patch'
import { withEventConfigVisibilityDefaults } from '@/lib/event-config-visibility'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { EventConfig, EventConfigPatch } from '@/models/EventConfig'
import { toast } from 'sonner'

import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Switch } from '@/components/switch'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import {
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon,
  ClockIcon,
  GlobeAltIcon,
  HandRaisedIcon,
  LinkIcon,
  LockClosedIcon,
  MapPinIcon,
  NewspaperIcon,
  PhoneIcon,
  PhotoIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  UsersIcon,
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
    <div className="flex items-center justify-between gap-3 py-4 sm:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-raised">
          <Icon className="size-4 text-ink-secondary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{title}</p>
            {badge && (
              <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-white/5 py-4">
      <Subheading>{title}</Subheading>
      {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  /** Kept for callers that share the event identity; public links live in EventSharePanel. */
  eventIdentifier?: string
  eventTimezone?: string | null
  initialConfig?: EventConfig | null
  onSaved?: () => void
}

export function EventConfigPanel({ eventId, eventTimezone, initialConfig, onSaved }: Props) {
  const reducedMotion = useReducedMotion()
  const configPath = eventId ? eventConfigPath(eventId) : null
  const {
    data: config,
    isLoading,
    isValidating,
    error: configError,
    mutate: retryConfig,
  } = useSWR<EventConfig>(configPath, fetcher, {
    ...responsiveListSwrOptions,
    fallbackData: initialConfig ?? undefined,
    revalidateOnMount: !initialConfig,
  })
  const effectiveConfig = useMemo(() => withEventConfigVisibilityDefaults(config), [config])
  const configErrorState = getDataErrorState(configError, config)

  // Access & visibility
  const [isPublic, setIsPublic] = useState(false)
  const [passwordProtection, setPasswordProtection] = useState('')

  // Guest interaction
  const [allowUploads, setAllowUploads] = useState(false)
  const [allowMessages, setAllowMessages] = useState(false)
  const [shareUploadsEnabled, setShareUploadsEnabled] = useState(false)
  const [autoApproveUploads, setAutoApproveUploads] = useState(false)
  const [maxUploadsPerGuest, setMaxUploadsPerGuest] = useState(30)
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
  const [showSecondLocation, setShowSecondLocation] = useState(true)
  const [showGallery, setShowGallery] = useState(true)
  const [showWall, setShowWall] = useState(true)
  const [showContact, setShowContact] = useState(true)
  const [showSchedule, setShowSchedule] = useState(true)
  const [showFooter, setShowFooter] = useState(true)
  const [showHeader, setShowHeader] = useState(true)
  const [showHosts, setShowHosts] = useState(true)

  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(() => new Set())
  const saveInFlightRef = useRef(false)
  const effectiveTimeZone = eventTimezone || 'America/Mexico_City'
  const momentWallState = getEventConfigMomentWallState({
    allow_uploads: allowUploads,
    share_uploads_enabled: shareUploadsEnabled,
    show_moment_wall: showWall,
  })
  const uploadsClosedByPublishedWall = momentWallState.wallPublished
  const sharedQrUploadsOpen = momentWallState.sharedUploadsOpen

  useEffect(() => {
    if (!effectiveConfig || isDirty || saving) return
    setIsPublic(effectiveConfig.is_public ?? false)
    setPasswordProtection(effectiveConfig.auth_password_preview ?? '')
    setAllowUploads(effectiveConfig.allow_uploads ?? false)
    setAllowMessages(effectiveConfig.allow_messages ?? false)
    setShareUploadsEnabled(
      Boolean((effectiveConfig.allow_uploads ?? false) && (effectiveConfig.share_uploads_enabled ?? false))
    )
    setAutoApproveUploads(effectiveConfig.auto_approve_uploads ?? false)
    setMaxUploadsPerGuest(
      typeof effectiveConfig.max_uploads_per_guest === 'number' && effectiveConfig.max_uploads_per_guest >= 0
        ? effectiveConfig.max_uploads_per_guest
        : 30
    )
    setNotifyOnMomentUpload(effectiveConfig.notify_on_moment_upload ?? false)
    setActiveFrom(toDateTimeLocalValue(effectiveConfig.active_from, effectiveTimeZone))
    setActiveUntil(toDateTimeLocalValue(effectiveConfig.active_until, effectiveTimeZone))
    setWelcomeMessage(effectiveConfig.default_welcome_message ?? effectiveConfig.welcome_message ?? '')
    setThankYouMessage(effectiveConfig.default_thank_you_message ?? effectiveConfig.thank_you_message ?? '')
    setMomentMessage(effectiveConfig.default_moment_request_message ?? effectiveConfig.moment_message ?? '')
    setGuestSignatureTitle(effectiveConfig.default_guest_signature_title ?? effectiveConfig.guest_signature_title ?? '')
    setShowCountdown(effectiveConfig.show_countdown ?? true)
    setShowRsvp(effectiveConfig.show_rsvp_section ?? effectiveConfig.show_rsvp ?? true)
    setShowLocation(effectiveConfig.show_event_location ?? effectiveConfig.show_location ?? true)
    setShowSecondLocation(effectiveConfig.show_second_location ?? true)
    setShowGallery(effectiveConfig.show_photo_gallery ?? effectiveConfig.show_gallery ?? true)
    setShowWall(resolveEventConfigMomentWallPublished(effectiveConfig))
    setShowContact(effectiveConfig.show_contact_section ?? effectiveConfig.show_contact ?? true)
    setShowSchedule(effectiveConfig.show_event_schedule ?? effectiveConfig.show_schedule ?? true)
    setShowFooter(effectiveConfig.show_footer ?? true)
    setShowHeader(effectiveConfig.show_header ?? true)
    setShowHosts(effectiveConfig.show_hosts_section ?? true)
    setDirtyFields(new Set<string>())
    setIsDirty(false)
  }, [effectiveConfig, effectiveTimeZone, isDirty, saving])

  const writeConfigCaches = async (nextConfig: EventConfig) => {
    await mutate(eventConfigPath(eventId), nextConfig, { revalidate: false })
    await mutate(
      (key) => isEventConfigBackedEventCacheKey(key, eventId),
      (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, nextConfig),
      { revalidate: false }
    )
  }

  const mark = (field: string) => {
    setDirtyFields((prev) => {
      const next = new Set(prev)
      next.add(field)
      return next
    })
    setIsDirty(true)
  }

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
    if (saveInFlightRef.current || !effectiveConfig) return
    if (isLocalDateTimeRangeInvalid(activeFrom, activeUntil)) {
      toast.error('La fecha final debe ser posterior a la inicial')
      return
    }

    const snapshot = effectiveConfig as EventConfig
    saveInFlightRef.current = true
    setSaving(true)
    try {
      const uploadLimit = Number.isFinite(maxUploadsPerGuest) ? Math.max(0, Math.min(500, maxUploadsPerGuest)) : 30
      const payloadValues: EventConfigPatch = {
        is_public: isPublic,
        auth_password_preview: passwordProtection,
        allow_uploads: allowUploads,
        allow_messages: allowMessages,
        share_uploads_enabled: allowUploads && shareUploadsEnabled,
        auto_approve_uploads: autoApproveUploads,
        max_uploads_per_guest: uploadLimit,
        notify_on_moment_upload: notifyOnMomentUpload,
        active_from:
          activeFrom && !activeFrom.startsWith('0001-') ? toRFC3339(activeFrom, effectiveTimeZone) : GO_ZERO_RFC3339,
        active_until:
          activeUntil && !activeUntil.startsWith('0001-') ? toRFC3339(activeUntil, effectiveTimeZone) : null,
        default_welcome_message: welcomeMessage,
        default_thank_you_message: thankYouMessage,
        default_moment_request_message: momentMessage,
        default_guest_signature_title: guestSignatureTitle,
        show_countdown: showCountdown,
        show_rsvp_section: showRsvp,
        show_event_location: showLocation,
        show_second_location: showSecondLocation,
        show_photo_gallery: showGallery,
        show_moment_wall: showWall,
        show_contact_section: showContact,
        show_event_schedule: showSchedule,
        show_footer: showFooter,
        show_header: showHeader,
        show_hosts_section: showHosts,
      }
      const payload = normalizeEventConfigPatch(
        Object.fromEntries(
          [...dirtyFields].map((field) => [field, payloadValues[field as keyof EventConfigPatch]])
        ) as EventConfigPatch
      )
      const optimistic: EventConfig = { ...snapshot, ...payload }
      await writeConfigCaches(optimistic)

      const res = await api.put<EventConfig>(eventConfigPath(eventId), payload)
      const updated = readApiData<EventConfig | null>(res.data)
      if (hasEventConfigCacheIdentity(updated)) {
        await mutate(
          eventConfigPath(eventId),
          (current: EventConfig | undefined) => replaceEventConfigCacheValue(current, updated) as EventConfig,
          { revalidate: false }
        )
        await mutate(
          (key) => isEventConfigBackedEventCacheKey(key, eventId),
          (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, updated),
          { revalidate: false }
        )
      } else {
        await mutate(eventConfigPath(eventId))
        await mutate((key) => isEventConfigBackedEventCacheKey(key, eventId))
      }
      setDirtyFields(new Set<string>())
      setIsDirty(false)
      onSaved?.()
      toast.success('Configuración guardada')
    } catch (err: unknown) {
      await writeConfigCaches(snapshot)
      toast.error(getApiErrorMessage(err, 'Error al guardar la configuración'))
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  if (isLoading && !effectiveConfig) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
        ))}
      </div>
    )
  }

  if (!effectiveConfig) {
    return <div className="py-12 text-center text-sm text-ink-muted">No se pudo cargar la configuración del evento.</div>
  }

  return (
    <div className="space-y-6">
      {configErrorState === 'stale' && (
        <StaleDataNotice label="configuración" onRetry={() => void retryConfig()} retrying={isValidating} />
      )}

      {/* ── Access & Visibility ────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { delay: 0.04 }}
        className="divide-y divide-white/5 rounded-xl border border-white/10 bg-surface/50 px-5"
      >
        <SectionHeader title="Visibilidad y acceso" />

        <SettingRow
          icon={GlobeAltIcon}
          title="Evento público"
          description="El evento es accesible sin contraseña para cualquier persona con el enlace."
          checked={isPublic}
          onChange={(v) => {
            setIsPublic(v)
            mark('is_public')
          }}
        />

        {/* Password */}
        <div className="py-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-raised">
              <LockClosedIcon className="size-4 text-ink-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Contraseña de acceso</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Opcional. Si se establece, los invitados deberán ingresarla.
              </p>
            </div>
          </div>
          <Field>
            <Label className="sr-only">Contraseña</Label>
            <Input
              type="text"
              value={passwordProtection}
              onChange={(e) => {
                setPasswordProtection(e.target.value)
                mark('auth_password_preview')
              }}
              placeholder="Dejar vacío para no usar contraseña"
            />
          </Field>
        </div>
      </motion.div>

      {/* ── Guest Interaction ──────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { delay: 0.08 }}
        className="divide-y divide-white/5 rounded-xl border border-white/10 bg-surface/50 px-5"
      >
        <SectionHeader title="Interacción de invitados" subtitle="Permite que los invitados participen en el evento." />

        <SettingRow
          icon={PhotoIcon}
          title="Permitir subir fotos"
          description={
            uploadsClosedByPublishedWall
              ? 'Preferencia guardada para reabrir uploads al despublicar el muro; mientras esta publicado, el backend cierra las subidas publicas.'
              : 'Los invitados podran subir fotos y videos desde su dispositivo. Los videos no se incluyen en descargas ZIP.'
          }
          checked={allowUploads}
          onChange={(v) => {
            setAllowUploads(v)
            if (!v) setShareUploadsEnabled(false)
            mark('allow_uploads')
          }}
          badge="Muro"
        />

        <SettingRow
          icon={LinkIcon}
          title="Uploads por QR compartido"
          description={
            uploadsClosedByPublishedWall
              ? 'El muro ya esta publicado; la pagina publica y el QR de uploads reciben este permiso cerrado.'
              : 'Permite que cualquier invitado con el QR del evento suba fotos sin token personal.'
          }
          checked={sharedQrUploadsOpen}
          onChange={(v) => {
            setShareUploadsEnabled(v)
            mark('share_uploads_enabled')
          }}
          disabled={!allowUploads || uploadsClosedByPublishedWall}
          badge="QR"
        />

        <SettingRow
          icon={ChatBubbleLeftRightIcon}
          title="Permitir mensajes"
          description="Los invitados podrán dejar un mensaje junto con sus fotos y videos."
          checked={allowMessages}
          onChange={(v) => {
            setAllowMessages(v)
            mark('allow_messages')
          }}
          badge="Muro"
        />

        <SettingRow
          icon={CheckCircleIcon}
          title="Auto-aprobar momentos"
          description="Las fotos y videos subidos apareceran en el muro sin revision manual."
          checked={autoApproveUploads}
          onChange={(v) => {
            setAutoApproveUploads(v)
            mark('auto_approve_uploads')
          }}
          badge="Muro"
        />

        <div className="py-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-raised">
              <PhotoIcon className="size-4 text-ink-secondary" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Limite de uploads</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Cantidad maxima de archivos por invitado/IP en la ventana publica. Usa 0 para el default global de 30.
              </p>
            </div>
          </div>
          <Input
            id="event-config-max-uploads"
            aria-label="Límite de uploads por invitado o IP"
            type="number"
            min={0}
            max={500}
            step={1}
            value={maxUploadsPerGuest}
            onChange={(e) => {
              setMaxUploadsPerGuest(Number(e.target.value))
              mark('max_uploads_per_guest')
            }}
          />
        </div>

        <SettingRow
          icon={BellAlertIcon}
          title="Notificar al subir momento"
          description="Recibe una notificación cuando un invitado sube un momento."
          checked={notifyOnMomentUpload}
          onChange={(v) => {
            setNotifyOnMomentUpload(v)
            mark('notify_on_moment_upload')
          }}
        />
      </motion.div>

      {/* ── Scheduling ─────────────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { delay: 0.12 }}
        className="space-y-4 rounded-xl border border-white/10 bg-surface/50 px-5 py-4"
      >
        <SectionHeader
          title="Programar visibilidad"
          subtitle="Define cuándo la página pública del evento estará activa."
        />

        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <ClockIcon className="size-4 text-ink-muted" />
              <label htmlFor="event-config-active-from" className="text-sm font-medium text-ink-secondary">
                Disponible desde
              </label>
            </div>
            <input
              id="event-config-active-from"
              aria-describedby="event-config-availability-help"
              type="datetime-local"
              value={activeFrom}
              onChange={(e) => {
                setActiveFrom(e.target.value)
                mark('active_from')
              }}
              className="w-full rounded-lg border border-white/10 bg-canvas px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <ClockIcon className="size-4 text-ink-muted" />
              <label htmlFor="event-config-active-until" className="text-sm font-medium text-ink-secondary">
                Disponible hasta
              </label>
            </div>
            <input
              id="event-config-active-until"
              aria-describedby="event-config-availability-help"
              type="datetime-local"
              value={activeUntil}
              onChange={(e) => {
                setActiveUntil(e.target.value)
                mark('active_until')
              }}
              className="w-full rounded-lg border border-white/10 bg-canvas px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <p id="event-config-availability-help" className="text-xs text-ink-muted">
          Deja en blanco para que la página esté siempre disponible.
        </p>
      </motion.div>

      {/* ── Custom Messages ─────────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { delay: 0.16 }}
        className="space-y-4 rounded-xl border border-white/10 bg-surface/50 px-5 py-4"
      >
        <SectionHeader
          title="Mensajes personalizados"
          subtitle="Texto que verán los invitados en diferentes momentos."
        />

        <div className="space-y-4 pt-2">
          {(
            [
              {
                key: 'welcomeMessage',
                field: 'default_welcome_message',
                label: 'Mensaje de bienvenida',
                icon: ChatBubbleOvalLeftEllipsisIcon,
                placeholder: 'Bienvenido a nuestro evento, estamos felices de tenerte aquí.',
                value: welcomeMessage,
                set: setWelcomeMessage,
              },
              {
                key: 'thankYouMessage',
                field: 'default_thank_you_message',
                label: 'Mensaje de agradecimiento (post-RSVP)',
                icon: CheckCircleIcon,
                placeholder: '¡Gracias por confirmar tu asistencia! Te esperamos.',
                value: thankYouMessage,
                set: setThankYouMessage,
              },
              {
                key: 'momentMessage',
                field: 'default_moment_request_message',
                label: 'Invitación a compartir momentos',
                icon: PhotoIcon,
                placeholder: '¡Comparte tus fotos favoritas del evento!',
                value: momentMessage,
                set: setMomentMessage,
              },
              {
                key: 'guestSignatureTitle',
                field: 'default_guest_signature_title',
                label: 'Título para firma de invitados',
                icon: HandRaisedIcon,
                placeholder: 'Escribe tu mensaje para los novios…',
                value: guestSignatureTitle,
                set: setGuestSignatureTitle,
              },
            ] as const
          ).map(({ key, field, label, icon: Icon, placeholder, value, set }) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center gap-2">
                <Icon className="size-4 text-ink-muted" />
                <label htmlFor={`event-config-${key}`} className="text-sm font-medium text-ink-secondary">
                  {label}
                </label>
              </div>
              <textarea
                id={`event-config-${key}`}
                value={value}
                onChange={(e) => {
                  set(e.target.value)
                  mark(field)
                }}
                placeholder={placeholder}
                rows={2}
                className="w-full resize-none rounded-lg border border-white/10 bg-canvas px-3 py-2 text-sm text-ink placeholder-ink-muted focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Section Visibility Toggles ──────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { delay: 0.2 }}
        className="divide-y divide-white/5 rounded-xl border border-white/10 bg-surface/50 px-5"
      >
        <SectionHeader
          title="Visibilidad de bloques"
          subtitle="Controla qué bloques aparecen en la página pública del evento."
        />

        {(
          [
            {
              icon: NewspaperIcon,
              title: 'Portada',
              field: 'show_header',
              desc: 'Hero principal del evento',
              val: showHeader,
              set: setShowHeader,
            },
            {
              icon: ClockIcon,
              title: 'Cuenta regresiva',
              field: 'show_countdown',
              desc: 'Timer hasta el evento',
              val: showCountdown,
              set: setShowCountdown,
            },
            {
              icon: NewspaperIcon,
              title: 'RSVP',
              field: 'show_rsvp_section',
              desc: 'Formulario de confirmación',
              val: showRsvp,
              set: setShowRsvp,
            },
            {
              icon: MapPinIcon,
              title: 'Ubicación',
              field: 'show_event_location',
              desc: 'Mapa y dirección del evento',
              val: showLocation,
              set: setShowLocation,
            },
            {
              icon: Squares2X2Icon,
              title: 'Galería',
              field: 'show_photo_gallery',
              desc: 'Fotos del evento',
              val: showGallery,
              set: setShowGallery,
            },
            {
              icon: PhotoIcon,
              title: 'Muro de momentos',
              field: 'show_moment_wall',
              desc: 'Los invitados podrán ver los momentos aprobados en la página del evento.',
              val: showWall,
              set: setShowWall,
            },
            {
              icon: UsersIcon,
              title: 'Anfitriones',
              field: 'show_hosts_section',
              desc: 'Lista de anfitriones o graduados',
              val: showHosts,
              set: setShowHosts,
            },
            {
              icon: PhoneIcon,
              title: 'Contacto',
              field: 'show_contact_section',
              desc: 'Información de contacto del organizador',
              val: showContact,
              set: setShowContact,
            },
            {
              icon: RectangleStackIcon,
              title: 'Agenda',
              field: 'show_event_schedule',
              desc: 'Horario e itinerario',
              val: showSchedule,
              set: setShowSchedule,
            },
            {
              icon: RectangleStackIcon,
              title: 'Footer',
              field: 'show_footer',
              desc: 'Pie con marca y datos de contacto',
              val: showFooter,
              set: setShowFooter,
            },
            {
              icon: MapPinIcon,
              title: 'Recepción',
              field: 'show_second_location',
              desc: 'Segunda ubicación o sede posterior',
              val: showSecondLocation,
              set: setShowSecondLocation,
            },
          ] as const
        ).map(({ icon: Icon, title, field, desc, val, set }) => (
          <SettingRow
            key={title}
            icon={Icon}
            title={title}
            description={desc}
            checked={val}
            onChange={(v) => {
              set(v)
              mark(field)
            }}
          />
        ))}
      </motion.div>

      {/* Save */}
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        {isDirty && (
          <motion.p
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : undefined}
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
