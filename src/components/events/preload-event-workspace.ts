import { eventDetailPath, eventTypesPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { sanitizeEvent } from '@/lib/sanitize-event'
import type { Event } from '@/models/Event'
import { mutate, preload } from 'swr'

const SNAPSHOT_TTL_MS = 30_000
const MAX_SNAPSHOTS = 20
const eventSnapshots = new Map<string, { event: Event; expiresAt: number }>()
const authoritativeDetails = new Map<string, number>()

function rememberSnapshot(event: Event) {
  const snapshot = sanitizeEvent(event)
  eventSnapshots.delete(event.id)
  eventSnapshots.set(event.id, { event: snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS })

  while (eventSnapshots.size > MAX_SNAPSHOTS) {
    const oldestId = eventSnapshots.keys().next().value
    if (!oldestId) break
    eventSnapshots.delete(oldestId)
    authoritativeDetails.delete(oldestId)
  }
  return snapshot
}

export const eventWorkspaceCache = {
  clear() {
    eventSnapshots.clear()
    authoritativeDetails.clear()
  },
  prime(event: Event) {
    const snapshot = rememberSnapshot(event)
    return mutate(eventDetailPath(event.id), snapshot, { revalidate: false })
  },
  rememberAuthoritative(event: Event) {
    const snapshot = rememberSnapshot(event)
    authoritativeDetails.set(event.id, Date.now() + SNAPSHOT_TTL_MS)
    return snapshot
  },
  hasAuthoritative(eventId: string) {
    const expiresAt = authoritativeDetails.get(eventId)
    if (!expiresAt) return false
    if (expiresAt <= Date.now()) {
      authoritativeDetails.delete(eventId)
      return false
    }
    return true
  },
  peek(eventId: string) {
    const snapshot = eventSnapshots.get(eventId)
    if (!snapshot) return undefined
    if (snapshot.expiresAt <= Date.now()) {
      eventSnapshots.delete(eventId)
      return undefined
    }
    return snapshot.event
  },
}

export const eventWorkspacePreloaders = {
  detail: (eventId: string) => preload(eventDetailPath(eventId), fetcher),
  eventTypes: () => preload(eventTypesPath(), fetcher),
}

/**
 * Paints Event Detail from the list snapshot immediately, then refreshes every
 * authoritative dependency in parallel before or during navigation.
 */
export function preloadEventWorkspace(event: Event): Promise<unknown> {
  if (eventWorkspaceCache.hasAuthoritative(event.id)) {
    return Promise.resolve(eventWorkspaceCache.peek(event.id))
  }

  void eventWorkspaceCache.prime(event)

  const detailTask = Promise.resolve(eventWorkspacePreloaders.detail(event.id)).then((detail) => {
    if (detail && typeof detail === 'object') eventWorkspaceCache.rememberAuthoritative(detail as Event)
    return detail
  })
  const tasks: Promise<unknown>[] = [detailTask]

  // Most list payloads already include the resolved type. Avoid making a
  // lower-priority catalog request compete with detail and summary data.
  if (event.event_type_id && !event.event_type?.name) {
    tasks.push(Promise.resolve(eventWorkspacePreloaders.eventTypes()))
  }

  return Promise.all(tasks)
}
