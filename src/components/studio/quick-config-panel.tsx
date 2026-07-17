'use client'

import { inputCls, labelCls } from '@/components/studio/studio-constants'
import { Switch } from '@/components/switch'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventConfigPath } from '@/lib/api-paths'
import {
  hasEventConfigCacheIdentity,
  isEventConfigBackedEventCacheKey,
  patchEventConfigIntoEventCacheValue,
  replaceEventConfigCacheValue,
} from '@/lib/event-config-cache'
import { getEventConfigMomentWallState, resolveEventConfigMomentWallPublished } from '@/lib/event-config-moment-wall'
import { normalizeEventConfigPatch } from '@/lib/event-config-patch'
import { withEventConfigVisibilityDefaults } from '@/lib/event-config-visibility'
import type { EventConfig, EventConfigPatch } from '@/models/EventConfig'
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { mutate } from 'swr'

interface QuickConfigPanelProps {
  config: EventConfig | undefined
  eventId: string
  onSaved: (config?: EventConfig) => void
}

export function QuickConfigPanel({ config, eventId, onSaved }: QuickConfigPanelProps) {
  const effectiveConfig = useMemo(() => withEventConfigVisibilityDefaults(config), [config])
  const [saving, setSaving] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState<string>('')
  const [thankYouMsg, setThankYouMsg] = useState<string>('')
  const [savingMsg, setSavingMsg] = useState(false)

  useEffect(() => {
    if (!config) return
    setWelcomeMsg(config.default_welcome_message ?? config.welcome_message ?? '')
    setThankYouMsg(config.default_thank_you_message ?? config.thank_you_message ?? '')
  }, [config])

  const writeConfigCaches = async (nextConfig: EventConfig) => {
    await mutate(eventConfigPath(eventId), nextConfig, { revalidate: false })
    await mutate(
      (key) => isEventConfigBackedEventCacheKey(key, eventId),
      (current: unknown) => patchEventConfigIntoEventCacheValue(current, eventId, nextConfig),
      { revalidate: false }
    )
  }

  const toggle = async (field: keyof EventConfig, currentValue: boolean) => {
    if (!effectiveConfig) return
    const snapshot = effectiveConfig as EventConfig
    const patch = normalizeEventConfigPatch({ [field]: !currentValue } as EventConfigPatch)
    const optimistic: EventConfig = { ...snapshot, ...patch }
    setSaving(field as string)
    onSaved(optimistic)
    await writeConfigCaches(optimistic)
    try {
      const res = await api.put<EventConfig>(eventConfigPath(eventId), patch)
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
      onSaved(updated ?? undefined)
    } catch (err: unknown) {
      await writeConfigCaches(snapshot)
      onSaved(snapshot)
      toast.error(getApiErrorMessage(err, 'Error al actualizar'))
    } finally {
      setSaving(null)
    }
  }

  const saveMessages = async () => {
    if (!config) return
    const snapshot = effectiveConfig as EventConfig
    const patch = {
      default_welcome_message: welcomeMsg,
      default_thank_you_message: thankYouMsg,
    } satisfies EventConfigPatch
    const optimistic: EventConfig = { ...snapshot, ...patch }
    setSavingMsg(true)
    onSaved(optimistic)
    await writeConfigCaches(optimistic)
    try {
      const res = await api.put<EventConfig>(eventConfigPath(eventId), patch)
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
      onSaved(updated ?? undefined)
      toast.success('Mensajes guardados')
    } catch (err: unknown) {
      if (snapshot) {
        await writeConfigCaches(snapshot)
        onSaved(snapshot)
      }
      toast.error(getApiErrorMessage(err, 'Error al guardar mensajes'))
    } finally {
      setSavingMsg(false)
    }
  }

  if (!effectiveConfig) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 rounded bg-surface-raised" />
        ))}
      </div>
    )
  }

  const momentWallState = getEventConfigMomentWallState(effectiveConfig)
  const wallPublished = momentWallState.wallPublished
  const publicUploadsOpen = momentWallState.personalUploadsOpen

  const toggleRows = [
    { field: 'is_public' as const, label: 'Pagina publica', value: effectiveConfig.is_public },
    { field: 'show_header' as const, label: 'Portada', value: effectiveConfig.show_header ?? true },
    {
      field: 'show_rsvp_section' as const,
      label: 'Mostrar RSVP',
      value: effectiveConfig.show_rsvp_section ?? effectiveConfig.show_rsvp ?? true,
    },
    { field: 'show_countdown' as const, label: 'Cuenta regresiva', value: effectiveConfig.show_countdown ?? true },
    {
      field: 'show_event_location' as const,
      label: 'Ubicacion',
      value: effectiveConfig.show_event_location ?? effectiveConfig.show_location ?? true,
    },
    { field: 'show_second_location' as const, label: 'Recepcion', value: effectiveConfig.show_second_location ?? true },
    {
      field: 'show_photo_gallery' as const,
      label: 'Galeria',
      value: effectiveConfig.show_photo_gallery ?? effectiveConfig.show_gallery ?? true,
    },
    {
      field: 'show_moment_wall' as const,
      label: 'Momentos',
      value: resolveEventConfigMomentWallPublished(effectiveConfig),
    },
    { field: 'show_hosts_section' as const, label: 'Anfitriones', value: effectiveConfig.show_hosts_section ?? true },
    {
      field: 'show_contact_section' as const,
      label: 'Contacto',
      value: effectiveConfig.show_contact_section ?? effectiveConfig.show_contact ?? true,
    },
    {
      field: 'show_event_schedule' as const,
      label: 'Agenda',
      value: effectiveConfig.show_event_schedule ?? effectiveConfig.show_schedule ?? true,
    },
    { field: 'show_footer' as const, label: 'Footer', value: effectiveConfig.show_footer ?? true },
    { field: 'allow_uploads' as const, label: 'Subir fotos', value: publicUploadsOpen, disabled: wallPublished },
    { field: 'allow_messages' as const, label: 'Mensajes de guests', value: effectiveConfig.allow_messages ?? false },
  ]

  return (
    <div className="space-y-4">
      {/* Toggle rows */}
      <div className="space-y-0.5">
        {toggleRows.map(({ field, label, value, disabled }) => (
          <div key={field} className="flex items-center justify-between px-1 py-1.5">
            <span className="text-xs text-ink-secondary">{label}</span>
            <div className="flex items-center gap-1.5">
              {saving === field && <ArrowPathIcon className="size-3 animate-spin text-ink-muted" />}
              <Switch
                checked={value ?? false}
                onChange={() => toggle(field, value ?? false)}
                disabled={saving !== null || disabled === true}
                aria-label={label}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Text messages */}
      <div className="space-y-3 border-t border-white/10 pt-3">
        <p className="px-1 text-[10px] font-medium tracking-wide text-ink-muted uppercase">Mensajes personalizados</p>
        <div>
          <label className={labelCls}>Mensaje de bienvenida</label>
          <textarea
            rows={2}
            className={inputCls}
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            placeholder="¡Bienvenido a nuestro evento!"
          />
        </div>
        <div>
          <label className={labelCls}>Mensaje de agradecimiento</label>
          <textarea
            rows={2}
            className={inputCls}
            value={thankYouMsg}
            onChange={(e) => setThankYouMsg(e.target.value)}
            placeholder="¡Gracias por confirmar tu asistencia!"
          />
        </div>
        <button
          onClick={saveMessages}
          disabled={savingMsg}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-soft disabled:opacity-50"
        >
          {savingMsg ? <ArrowPathIcon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
          Guardar mensajes
        </button>
      </div>
    </div>
  )
}
