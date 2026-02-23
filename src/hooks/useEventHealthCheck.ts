'use client'

import { useRef, useEffect } from 'react'
import type { Event } from '@/models/Event'
import { detectEventIssues } from '@/lib/sanitize-event'

/**
 * Detects data-integrity issues in an event and logs them.
 * The in-memory defaults are applied by `sanitizeEvent()` at render time.
 *
 * NOTE: The backend `/events/:id/repair` endpoint does not exist yet.
 * When it does, uncomment the repair call below.
 */
export function useEventHealthCheck(event: Event | undefined) {
  const hasRun = useRef(false)

  useEffect(() => {
    if (!event || hasRun.current) return
    hasRun.current = true

    const issues = detectEventIssues(event)
    if (issues.length === 0) return

    console.info(
      `[HealthCheck] Event ${event.id} has ${issues.length} issue(s):`,
      issues.map((i) => `${i.field}: ${i.issue}`).join(', '),
    )
  }, [event])
}
