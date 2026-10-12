import { getEventConfigMomentWallState } from '@/lib/event-config-moment-wall'
import { withEventConfigVisibilityDefaults } from '@/lib/event-config-visibility'
import { canonicalSectionType } from '@/lib/section-type-aliases'
import type { EventConfig } from '@/models/EventConfig'

/**
 * Why a section is hidden on the public page by an event-level "Mostrar …" switch,
 * even though the section itself is visible (STU-54).
 *
 * Mirrors the backend rule (itbem-events-backend services/events/PageSpecService.go
 * `pageSpecSectionVisible`), keyed by the dashboard canonical section type.
 */
export interface SectionConfigHiddenReason {
  /** EventConfig flag that hides the section. */
  field: keyof EventConfig
  /** Name of the switch in Ajustes (Studio) and in Configuración > Acceso, interacción y visibilidad. */
  switchLabel: string
  /** One sentence for the host, in Spanish. */
  message: string
}

type FlagRule = { field: keyof EventConfig; switchLabel: string; read: (config: EventConfig) => boolean | undefined }

const COUNTDOWN: FlagRule = { field: 'show_countdown', switchLabel: 'Cuenta regresiva', read: (c) => c.show_countdown }
const RSVP: FlagRule = {
  field: 'show_rsvp_section',
  switchLabel: 'Mostrar RSVP',
  read: (c) => c.show_rsvp_section ?? c.show_rsvp,
}
const LOCATION: FlagRule = {
  field: 'show_event_location',
  switchLabel: 'Ubicación',
  read: (c) => c.show_event_location ?? c.show_location,
}
const RECEPTION: FlagRule = {
  field: 'show_second_location',
  switchLabel: 'Recepción',
  read: (c) => c.show_second_location,
}
const GALLERY: FlagRule = {
  field: 'show_photo_gallery',
  switchLabel: 'Galería',
  read: (c) => c.show_photo_gallery ?? c.show_gallery,
}
const SCHEDULE: FlagRule = {
  field: 'show_event_schedule',
  switchLabel: 'Agenda',
  read: (c) => c.show_event_schedule ?? c.show_schedule,
}
const HEADER: FlagRule = { field: 'show_header', switchLabel: 'Portada', read: (c) => c.show_header }
const CONTACT: FlagRule = {
  field: 'show_contact_section',
  switchLabel: 'Contacto',
  read: (c) => c.show_contact_section ?? c.show_contact,
}
const HOSTS: FlagRule = { field: 'show_hosts_section', switchLabel: 'Anfitriones', read: (c) => c.show_hosts_section }
// The moment wall section shows while the wall is published or uploads are open.
const MOMENT_WALL: FlagRule = {
  field: 'show_moment_wall',
  switchLabel: 'Momentos',
  read: (c) => {
    const state = getEventConfigMomentWallState(c)
    return state.wallPublished || state.uploadsEnabled
  },
}

const RULE_BY_CANONICAL_TYPE: Record<string, FlagRule> = {
  CountdownHeader: COUNTDOWN,
  RSVPConfirmation: RSVP,
  EventVenue: LOCATION,
  MAP: LOCATION,
  Reception: RECEPTION,
  PhotoGrid: GALLERY,
  GALLERY: GALLERY,
  MomentWall: MOMENT_WALL,
  Agenda: SCHEDULE,
  SCHEDULE: SCHEDULE,
  GraduationHero: HEADER,
  HERO: HEADER,
  Contact: CONTACT,
  Hosts: HOSTS,
  GraduatesList: HOSTS,
}

export function sectionHiddenByEventConfig(
  sectionType: string | undefined,
  config: EventConfig | undefined
): SectionConfigHiddenReason | null {
  if (!sectionType || !config) return null
  const rule = RULE_BY_CANONICAL_TYPE[canonicalSectionType(sectionType)]
  if (!rule) return null

  const effective = withEventConfigVisibilityDefaults(config) ?? config
  if (rule.read(effective) !== false) return null

  return {
    field: rule.field,
    switchLabel: rule.switchLabel,
    message: `Oculta en la página pública porque el interruptor «${rule.switchLabel}» está apagado en los ajustes del evento.`,
  }
}
