import { getCalendarDaysUntil } from '@/lib/date-time'

export const EVENT_LIVE_REFRESH_INTERVAL_MS = 10_000
export const EVENT_COLLECTION_REFRESH_INTERVAL_MS = 60_000

const LIVE_GUEST_TABS = new Set(['invitados', 'invitaciones', 'rsvp', 'analiticas'])
const GUEST_COLLECTION_TABS = new Set<string>()

export function shouldLoadEventGuests(tab: string | null | undefined): boolean {
  return Boolean(tab && GUEST_COLLECTION_TABS.has(tab))
}

export function shouldRefreshEventGuests(tab: string | null | undefined): boolean {
  return Boolean(tab && LIVE_GUEST_TABS.has(tab))
}

export function eventLiveRefreshInterval(enabled: boolean): number {
  return enabled ? EVENT_LIVE_REFRESH_INTERVAL_MS : 0
}

export function eventGuestRefreshInterval(enabled: boolean, tab: string | null | undefined): number {
  if (!enabled) return 0
  return tab === 'analiticas' ? EVENT_COLLECTION_REFRESH_INTERVAL_MS : EVENT_LIVE_REFRESH_INTERVAL_MS
}

export function shouldLiveRefreshEvent(
  isActive: boolean,
  eventDate?: string | null,
  timeZone?: string | null,
  now = new Date()
): boolean {
  if (!isActive) return false
  const daysUntil = getCalendarDaysUntil(eventDate, timeZone, now)
  return daysUntil !== null && daysUntil >= 0
}
