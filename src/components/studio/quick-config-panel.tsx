'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import type { EventConfig } from '@/models/EventConfig'
import { Switch } from '@/components/switch'
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/20/solid'
import { inputCls, labelCls } from '@/components/studio/studio-constants'

interface QuickConfigPanelProps {
  config: EventConfig | undefined
  eventId: string
  onSaved: () => void
}

export function QuickConfigPanel({ config, eventId, onSaved }: QuickConfigPanelProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState<string>('')
  const [thankYouMsg, setThankYouMsg] = useState<string>('')
  const [savingMsg, setSavingMsg] = useState(false)

  // Populate text fields from config on first load
  if (config && welcomeMsg === '' && config.welcome_message) {
    setWelcomeMsg(config.welcome_message)
  }
  if (config && thankYouMsg === '' && config.thank_you_message) {
    setThankYouMsg(config.thank_you_message)
  }

  const toggle = async (field: keyof EventConfig, currentValue: boolean) => {
    setSaving(field as string)
    try {
      await api.put(`/events/${eventId}/config`, { ...config, [field]: !currentValue })
      await mutate(`/events/${eventId}/config`)
      onSaved()
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSaving(null)
    }
  }

  const saveMessages = async () => {
    if (!config) return
    setSavingMsg(true)
    try {
      await api.put(`/events/${eventId}/config`, {
        ...config,
        welcome_message: welcomeMsg,
        thank_you_message: thankYouMsg,
      })
      await mutate(`/events/${eventId}/config`)
      onSaved()
      toast.success('Mensajes guardados')
    } catch {
      toast.error('Error al guardar mensajes')
    } finally {
      setSavingMsg(false)
    }
  }

  if (!config) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded" />)}
      </div>
    )
  }

  const toggleRows = [
    { field: 'is_public' as const, label: 'Pagina publica', value: config.is_public },
    { field: 'show_rsvp' as const, label: 'Mostrar RSVP', value: config.show_rsvp ?? true },
    { field: 'show_countdown' as const, label: 'Cuenta regresiva', value: config.show_countdown ?? true },
    { field: 'show_location' as const, label: 'Ubicacion', value: config.show_location ?? true },
    { field: 'show_gallery' as const, label: 'Galeria', value: config.show_gallery ?? true },
    { field: 'show_wall' as const, label: 'Momentos', value: config.show_wall ?? true },
    { field: 'allow_uploads' as const, label: 'Subir fotos', value: config.allow_uploads ?? false },
    { field: 'allow_messages' as const, label: 'Mensajes de guests', value: config.allow_messages ?? false },
  ]

  return (
    <div className="space-y-4">
      {/* Toggle rows */}
      <div className="space-y-0.5">
        {toggleRows.map(({ field, label, value }) => (
          <div key={field} className="flex items-center justify-between py-1.5 px-1">
            <span className="text-xs text-zinc-400">{label}</span>
            <div className="flex items-center gap-1.5">
              {saving === field && <ArrowPathIcon className="size-3 text-zinc-600 animate-spin" />}
              <Switch
                checked={value ?? false}
                onChange={() => toggle(field, value ?? false)}
                disabled={saving !== null}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Text messages */}
      <div className="border-t border-white/10 pt-3 space-y-3">
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide px-1">Mensajes personalizados</p>
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
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
        >
          {savingMsg ? <ArrowPathIcon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
          Guardar mensajes
        </button>
      </div>
    </div>
  )
}
