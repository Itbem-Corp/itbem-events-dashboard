import type { EventCapabilities } from '@/models/EventMember'

export const EVENT_DETAIL_TAB_IDS = [
  'resumen',
  'invitados',
  'invitaciones',
  'asientos',
  'rsvp',
  'momentos',
  'analiticas',
  'configuracion',
] as const

export type EventDetailTabId = (typeof EVENT_DETAIL_TAB_IDS)[number]

export const DEFAULT_EVENT_DETAIL_TAB: EventDetailTabId = 'resumen'

export function getAvailableEventDetailTabs(capabilities?: EventCapabilities): EventDetailTabId[] {
  if (!capabilities) return [DEFAULT_EVENT_DETAIL_TAB]

  return [
    'resumen',
    'momentos',
    ...(capabilities['guest:manage'] ? (['invitados', 'invitaciones', 'asientos', 'rsvp'] as const) : []),
    ...(capabilities['analytics:view'] ? (['analiticas'] as const) : []),
    ...(capabilities['event:manage'] ? (['configuracion'] as const) : []),
  ]
}

export function isEventDetailTabId(value: string | null): value is EventDetailTabId {
  return value !== null && EVENT_DETAIL_TAB_IDS.some((tab) => tab === value)
}

export function resolveEventDetailTab(value: string | null): EventDetailTabId {
  return isEventDetailTabId(value) ? value : DEFAULT_EVENT_DETAIL_TAB
}

export function getEventDetailTabHref(pathname: string, currentSearch: string, tab: EventDetailTabId): string {
  const params = new URLSearchParams(currentSearch)

  if (tab === DEFAULT_EVENT_DETAIL_TAB) {
    params.delete('tab')
  } else {
    params.set('tab', tab)
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
