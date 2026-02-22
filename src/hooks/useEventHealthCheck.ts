'use client'

import { useRef, useEffect, useState } from 'react'
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'
import { detectEventIssues } from '@/lib/sanitize-event'

interface RepairResult {
  repaired: boolean
  fixes: string[]
  warnings: string[]
}

export function useEventHealthCheck(event: Event | undefined) {
  const hasRun = useRef(false)
  const [isRepairing, setIsRepairing] = useState(false)

  useEffect(() => {
    if (!event || hasRun.current) return
    hasRun.current = true

    const issues = detectEventIssues(event)
    if (issues.length === 0) return

    setIsRepairing(true)

    api.post(`/events/${event.id}/repair`)
      .then((res) => {
        const result: RepairResult = res.data?.data ?? res.data
        if (result?.repaired) {
          mutate(`/events/${event.id}`)
          mutate(`/events/${event.id}/config`)
          mutate(`/events/${event.id}/analytics`)
          mutate(`/moments?event_id=${event.id}`)

          const count = result.fixes?.length ?? 0
          toast.success(
            `Datos del evento optimizados (${count} corrección${count !== 1 ? 'es' : ''})`,
            { duration: 4000 }
          )

          if (result.warnings?.length) {
            for (const w of result.warnings) {
              toast.warning(w, { duration: 6000 })
            }
          }
        }
      })
      .catch(() => {
        console.warn('[HealthCheck] Repair call failed for event', event.id)
      })
      .finally(() => {
        setIsRepairing(false)
      })
  }, [event])

  return { isRepairing }
}
