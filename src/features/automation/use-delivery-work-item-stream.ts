'use client'

import { useAuthenticatedSSE, type AuthenticatedSSEStatus } from '@/hooks/useAuthenticatedSSE'
import type { ServerSentEvent } from '@/lib/realtime/server-sent-events'
import { deliveryWorkItemStreamPath } from '@/lib/api-paths'
import { useEffect, useRef } from 'react'

export type DeliveryWorkItemStreamEvent = {
  work_item_id: string
  revision: string
  state: string
  active_tasks: number
  last_activity_at?: string
  generated_at: string
}

type DeliveryWorkItemStreamOptions = {
  enabled?: boolean
  onSnapshot?: (event: DeliveryWorkItemStreamEvent) => void
  onUpdate?: (event: DeliveryWorkItemStreamEvent) => void
  onStatusChange?: (status: AuthenticatedSSEStatus) => void
}

export function parseDeliveryWorkItemStreamEvent(raw: ServerSentEvent): DeliveryWorkItemStreamEvent | null {
  if (raw.event !== 'snapshot' && raw.event !== 'update') return null
  try {
    const value = JSON.parse(raw.data) as Record<string, unknown>
    const activeTasks = value.active_tasks
    if (
      typeof value.work_item_id !== 'string' ||
      !value.work_item_id.trim() ||
      typeof value.revision !== 'string' ||
      !value.revision.trim() ||
      typeof value.state !== 'string' ||
      !value.state.trim() ||
      typeof activeTasks !== 'number' ||
      !Number.isSafeInteger(activeTasks) ||
      activeTasks < 0 ||
      typeof value.generated_at !== 'string' ||
      !value.generated_at.trim()
    ) return null

    return {
      work_item_id: value.work_item_id.trim(),
      revision: value.revision.trim(),
      state: value.state.trim(),
      active_tasks: activeTasks,
      ...(typeof value.last_activity_at === 'string' && value.last_activity_at.trim() ? { last_activity_at: value.last_activity_at.trim() } : {}),
      generated_at: value.generated_at.trim(),
    }
  } catch {
    return null
  }
}

export function isNewDeliveryWorkItemRevision(previousRevision: string | undefined, event: DeliveryWorkItemStreamEvent) {
  return previousRevision !== event.revision
}

export function deliveryWorkItemStreamEnabled(workItemId: string | null | undefined, state: string | null | undefined) {
  const terminal = state === 'released' || state === 'cancelled'
  return Boolean(workItemId?.trim() && !terminal)
}

export function useDeliveryWorkItemStream(
  workItemId: string | null | undefined,
  { enabled = true, onSnapshot, onUpdate, onStatusChange }: DeliveryWorkItemStreamOptions = {},
): { status: AuthenticatedSSEStatus } {
  const path = workItemId?.trim() ? deliveryWorkItemStreamPath(workItemId) : null
  const lastRevisionRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    // Switching tasks must allow the first snapshot of the new stream through
    // even when its revision happens to have the same opaque value.
    lastRevisionRef.current = undefined
  }, [path])

  return useAuthenticatedSSE({
    path,
    enabled,
    parse: parseDeliveryWorkItemStreamEvent,
    onStatusChange,
    onEvent: (event, rawEvent) => {
      // A new SSE connection always begins with a snapshot. The first
      // snapshot for a work item is authoritative; later healthy stream
      // renewals commonly carry the same revision and should not re-download
      // every panel just because the server rotated the subscription.
      if (rawEvent.event === 'snapshot') {
        if (!isNewDeliveryWorkItemRevision(lastRevisionRef.current, event)) return
        lastRevisionRef.current = event.revision
        onSnapshot?.(event)
        return
      }
      if (!isNewDeliveryWorkItemRevision(lastRevisionRef.current, event)) return
      lastRevisionRef.current = event.revision
      if (rawEvent.event === 'update') onUpdate?.(event)
    },
  })
}
