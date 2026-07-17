'use client'

import { EventConfigPanel } from '@/components/events/event-config-panel'
import { EventDesignPicker } from '@/components/events/event-design-picker'
import { EventSectionsManager } from '@/components/events/event-sections-manager'
import { EventSharePanel } from '@/components/events/event-share-panel'
import type { Event } from '@/models/Event'
import { ChevronDownIcon, EyeIcon, RectangleStackIcon, ShareIcon, SwatchIcon } from '@heroicons/react/20/solid'
import type { ComponentType, ReactNode } from 'react'

interface EventDetailSettingsPanelProps {
  event: Event
  onPublicContentChanged: () => void
}

interface SettingsDisclosureProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  eyebrow: string
  defaultOpen?: boolean
  children: ReactNode
}

function SettingsDisclosure({
  icon: Icon,
  title,
  description,
  eyebrow,
  defaultOpen = false,
  children,
}: SettingsDisclosureProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group overflow-hidden rounded-2xl border border-white/[0.09] bg-surface/48 shadow-[0_18px_48px_rgba(0,0,0,0.16)] ring-1 ring-black/15"
    >
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-indigo-300">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-[0.16em] text-ink-muted uppercase">{eyebrow}</span>
          <span className="mt-0.5 block text-sm font-semibold text-ink sm:text-base">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-ink-muted sm:text-sm">{description}</span>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-white/[0.07] p-4 sm:p-5">{children}</div>
    </details>
  )
}

export function EventDetailSettingsPanel({ event, onPublicContentChanged }: EventDetailSettingsPanelProps) {
  return (
    <section aria-labelledby="event-settings-heading" className="space-y-3">
      <div className="mb-6 max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-indigo-400 uppercase">Centro de control</p>
        <h2 id="event-settings-heading" className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Configuración del evento
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Comparte, estructura y publica la experiencia. Abre solo el bloque que necesitas para mantener el flujo
          enfocado.
        </p>
      </div>

      <SettingsDisclosure
        icon={ShareIcon}
        eyebrow="Distribución"
        title="Compartir evento"
        description="Enlaces personales, canales de envío y código QR."
        defaultOpen
      >
        <EventSharePanel event={event} />
      </SettingsDisclosure>

      <SettingsDisclosure
        icon={RectangleStackIcon}
        eyebrow="Contenido"
        title="Secciones de la página"
        description="Define y ordena lo que verán los invitados."
      >
        <EventSectionsManager
          eventId={event.id}
          initialSections={event.event_sections}
          onPublicContentChanged={onPublicContentChanged}
        />
      </SettingsDisclosure>

      <SettingsDisclosure
        icon={SwatchIcon}
        eyebrow="Identidad"
        title="Diseño y apariencia"
        description="Plantilla visual, paleta de colores y tipografía."
      >
        <EventDesignPicker
          eventId={event.id}
          initialConfig={event.event_config ?? event.config}
          onSaved={onPublicContentChanged}
        />
      </SettingsDisclosure>

      <SettingsDisclosure
        icon={EyeIcon}
        eyebrow="Publicación"
        title="Acceso, interacción y visibilidad"
        description="Privacidad, horarios, mensajes y bloques públicos."
      >
        <EventConfigPanel
          eventId={event.id}
          eventTimezone={event.timezone}
          initialConfig={event.event_config ?? event.config}
          onSaved={onPublicContentChanged}
        />
      </SettingsDisclosure>
    </section>
  )
}
