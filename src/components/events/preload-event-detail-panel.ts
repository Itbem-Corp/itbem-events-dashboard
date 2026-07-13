import type { EventDetailTabId } from '@/components/events/event-detail-tabs'
import {
  eventAnalyticsPath,
  eventGuestShareSummaryPath,
  eventInvitationsPagePath,
  eventGuestsPagePath,
  eventSeatingWorkspacePath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { preload } from 'swr'

type AsyncEventDetailTab = Exclude<EventDetailTabId, 'resumen'>

export const eventDetailPanelLoaders: Record<AsyncEventDetailTab, () => Promise<unknown>> = {
  invitados: () => import('@/components/events/event-detail-guests-panel'),
  invitaciones: () => import('@/components/events/invitation-tracker'),
  asientos: () => import('@/components/events/seating/seating-plan-v2'),
  rsvp: () => import('@/components/events/rsvp-tracker'),
  momentos: () => import('@/components/events/moments-wall'),
  analiticas: () => import('@/components/events/event-analytics-panel'),
  configuracion: () => import('@/components/events/event-detail-settings-panel'),
}

export function eventDetailGuestPagePath(eventId: string) {
  return eventGuestsPagePath(eventId, {
    page: 1,
    page_size: 50,
    filter: 'ALL',
    sort: 'name',
    direction: 'asc',
  })
}

export const eventDetailDataPreloaders = {
  seatingWorkspace: (eventId: string) => preload(eventSeatingWorkspacePath(eventId), fetcher),
  guestPage: (eventId: string) => preload(eventDetailGuestPagePath(eventId), fetcher),
  invitationsPage: (eventId: string) =>
    preload(
      eventInvitationsPagePath(eventId, {
        page: 1,
        page_size: 50,
        filter: 'ALL',
        sort: 'name',
        direction: 'asc',
      }),
      fetcher
    ),
  analytics: (eventId: string) => preload(eventAnalyticsPath(eventId), fetcher),
  share: (eventId: string) => preload(eventGuestShareSummaryPath(eventId), fetcher),
}

export function preloadEventDetailPanel(
  tab: EventDetailTabId,
  eventId?: string,
  { guestDataCached = false }: { guestDataCached?: boolean } = {}
): Promise<unknown> {
  if (tab === 'resumen') return Promise.resolve()

  const tasks: Promise<unknown>[] = [eventDetailPanelLoaders[tab]()]
  if (eventId && !guestDataCached && (tab === 'invitados' || tab === 'rsvp')) {
    tasks.push(Promise.resolve(eventDetailDataPreloaders.guestPage(eventId)))
  }
  if (eventId && tab === 'invitaciones') {
    tasks.push(Promise.resolve(eventDetailDataPreloaders.invitationsPage(eventId)))
  }
  if (eventId && tab === 'asientos') {
    tasks.push(Promise.resolve(eventDetailDataPreloaders.seatingWorkspace(eventId)))
  }
  if (eventId && tab === 'analiticas') {
    tasks.push(Promise.resolve(eventDetailDataPreloaders.analytics(eventId)))
  }
  return Promise.all(tasks)
}
