/**
 * Anchor of the "Secciones de la página" block in the event Configuración tab.
 * Studio links here when the event has no sections (STU-6); the settings panel
 * opens and scrolls to the block when the URL hash matches.
 */
export const EVENT_SECTIONS_SETTINGS_ANCHOR = 'secciones-de-la-pagina'

export function eventSectionsSettingsHref(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}?tab=configuracion#${EVENT_SECTIONS_SETTINGS_ANCHOR}`
}
