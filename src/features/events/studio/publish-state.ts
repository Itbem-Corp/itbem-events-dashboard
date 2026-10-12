import type { Event } from '@/models/Event'
import type { EventConfig } from '@/models/EventConfig'

export type PublishWindowState = 'open' | 'not_started' | 'ended'

export interface StudioPublishState {
  isActive: boolean
  isPublic: boolean
  window: PublishWindowState
  /** Guests can open the invitation link right now (active, public and inside the window). */
  reachable: boolean
  /** Studio considers the event published: active and public. */
  published: boolean
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function publishWindowState(
  config: Pick<EventConfig, 'active_from' | 'active_until'> | null | undefined,
  now: number = Date.now()
): PublishWindowState {
  const from = parseTime(config?.active_from)
  const until = parseTime(config?.active_until)
  if (from !== null && now < from) return 'not_started'
  if (until !== null && now > until) return 'ended'
  return 'open'
}

export function studioPublishState(
  event: Pick<Event, 'is_active'> | null | undefined,
  config: Pick<EventConfig, 'is_public' | 'active_from' | 'active_until'> | null | undefined,
  now: number = Date.now()
): StudioPublishState {
  const isActive = event?.is_active === true
  const isPublic = config?.is_public === true
  const window = publishWindowState(config, now)
  return {
    isActive,
    isPublic,
    window,
    published: isActive && isPublic,
    reachable: isActive && isPublic && window === 'open',
  }
}

export const PUBLISH_ACTIVATES_EVENT_CONFIRMATION =
  'Este evento está inactivo: ningún invitado puede abrir la invitación ni confirmar asistencia. ' +
  'Al publicarlo también se activará. ¿Publicar y activar el evento?'

/** Toast after a successful publish, telling the truth about whether guests can open the page. */
export function publishResultMessage(state: StudioPublishState): { tone: 'success' | 'warning'; message: string } {
  if (!state.published) {
    return { tone: 'warning', message: 'El evento aún no está publicado: revisa que esté activo y sea público.' }
  }
  if (state.window === 'not_started') {
    return {
      tone: 'warning',
      message: 'Evento publicado, pero la ventana de acceso aún no empieza: los invitados lo verán a partir de la fecha configurada.',
    }
  }
  if (state.window === 'ended') {
    return {
      tone: 'warning',
      message: 'Evento publicado, pero la ventana de acceso ya terminó: los invitados no podrán abrirlo hasta que la amplíes.',
    }
  }
  return { tone: 'success', message: '¡Evento publicado! Ya está visible para los invitados.' }
}
