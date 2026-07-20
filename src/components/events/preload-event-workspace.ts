import { eventDetailPath, eventTypesPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { sanitizeEvent } from '@/lib/sanitize-event'
import type { ScopedFetcherKey, ScopedFetcherScope } from '@/lib/request-context'
import type { Event } from '@/models/Event'
import { mutate, preload } from 'swr'

const SNAPSHOT_TTL_MS = 30_000
const MAX_SNAPSHOTS = 20
const eventSnapshots = new Map<string, { event: Event; expiresAt: number }>()
const authoritativeDetails = new Map<string, number>()

function cacheId(key: ScopedFetcherKey) {
  return JSON.stringify(key)
}

function rememberSnapshot(event: Event, detailKey: ScopedFetcherKey) {
  const snapshot = sanitizeEvent(event)
  const id = cacheId(detailKey)
  eventSnapshots.delete(id)
  eventSnapshots.set(id, { event: snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS })

  while (eventSnapshots.size > MAX_SNAPSHOTS) {
    const oldestKey = eventSnapshots.keys().next().value
    if (!oldestKey) break
    eventSnapshots.delete(oldestKey)
    authoritativeDetails.delete(oldestKey)
  }
  return snapshot
}

export const eventWorkspaceCache = {
  clear() {
    eventSnapshots.clear()
    authoritativeDetails.clear()
  },
  prime(event: Event, detailKey: ScopedFetcherKey) {
    const snapshot = rememberSnapshot(event, detailKey)
    return mutate(detailKey, snapshot, { revalidate: false })
  },
  rememberAuthoritative(event: Event, detailKey: ScopedFetcherKey) {
    const snapshot = rememberSnapshot(event, detailKey)
    authoritativeDetails.set(cacheId(detailKey), Date.now() + SNAPSHOT_TTL_MS)
    return snapshot
  },
  hasAuthoritative(detailKey: ScopedFetcherKey) {
    const id = cacheId(detailKey)
    const expiresAt = authoritativeDetails.get(id)
    if (!expiresAt) return false
    if (expiresAt <= Date.now()) {
      authoritativeDetails.delete(id)
      return false
    }
    return true
  },
  peek(detailKey: ScopedFetcherKey) {
    const id = cacheId(detailKey)
    const snapshot = eventSnapshots.get(id)
    if (!snapshot) return undefined
    if (snapshot.expiresAt <= Date.now()) {
      eventSnapshots.delete(id)
      return undefined
    }
    return snapshot.event
  },
}

export const eventWorkspacePreloaders = {
  detail: (eventId: string, scope: ScopedFetcherScope) => preload(scope(eventDetailPath(eventId)), fetcher),
  eventTypes: (scope: ScopedFetcherScope) => preload(scope(eventTypesPath()), fetcher),
}

/**
 * Paints Event Detail from the list snapshot immediately, then refreshes every
 * authoritative dependency in parallel before or during navigation.
 */
export function preloadEventWorkspace(event: Event, scope: ScopedFetcherScope): Promise<unknown> {
  const detailKey = scope(eventDetailPath(event.id))
  if (eventWorkspaceCache.hasAuthoritative(detailKey)) {
    return Promise.resolve(eventWorkspaceCache.peek(detailKey))
  }

  void eventWorkspaceCache.prime(event, detailKey)

  const detailTask = Promise.resolve(eventWorkspacePreloaders.detail(event.id, scope)).then((detail) => {
    if (detail && typeof detail === 'object') eventWorkspaceCache.rememberAuthoritative(detail as Event, detailKey)
    return detail
  })
  const tasks: Promise<unknown>[] = [detailTask]

  // Most list payloads already include the resolved type. Avoid making a
  // lower-priority catalog request compete with detail and summary data.
  if (event.event_type_id && !event.event_type?.name) {
    tasks.push(Promise.resolve(eventWorkspacePreloaders.eventTypes(scope)))
  }

  return Promise.all(tasks)
}
