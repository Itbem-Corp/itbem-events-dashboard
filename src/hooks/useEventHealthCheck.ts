'use client'

import { useEffect, useRef } from 'react'
import { mutate } from 'swr'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { eventRepairPath } from '@/lib/api-paths'
import type { ScopedFetcherKey } from '@/lib/request-context'
import { detectEventIssues } from '@/lib/sanitize-event'
import type { Event, EventRepairResponse } from '@/models/Event'

interface EventHealthCheckOptions {
  /** Only roles with event:manage can repair (the backend answers 403 otherwise). */
  canRepair: boolean
  /** The scoped SWR key the event detail page reads, refreshed after a repair. */
  eventKey: ScopedFetcherKey | null
}

/**
 * Detects data-integrity issues in an event and asks the backend to repair them once.
 * The in-memory defaults are applied by `sanitizeEvent()` at render time.
 */
export function useEventHealthCheck(event: Event | undefined, { canRepair, eventKey }: EventHealthCheckOptions) {
  const hasRun = useRef(false)

  useEffect(() => {
    // Wait for the capabilities: viewers and check-in staff never call repair (EVT-16).
    if (!event || hasRun.current || !canRepair) return
    hasRun.current = true

    // The protected detail endpoint intentionally returns a bare event row.
    // Missing relation objects here are not evidence of corrupt foreign keys.
    const issues = detectEventIssues(event, { checkRelations: false })
    if (issues.length === 0) return

    console.info(
      `[HealthCheck] Event ${event.id} has ${issues.length} issue(s):`,
      issues.map((i) => `${i.field}: ${i.issue}`).join(', ')
    )

    void api
      .post(eventRepairPath(event.id))
      .then(async (res) => {
        const data = readApiData<EventRepairResponse>(res.data)
        if (data?.repaired && eventKey) {
          await mutate(eventKey)
        }
      })
      .catch((err: unknown) => {
        console.warn('[HealthCheck] Event repair failed', err)
      })
  }, [canRepair, event, eventKey])
}
