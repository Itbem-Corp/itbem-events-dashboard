'use client'

import { useAuthenticatedSSE, type AuthenticatedSSEStatus } from '@/hooks/useAuthenticatedSSE'
import type { ServerSentEvent } from '@/lib/realtime/server-sent-events'
import { automationAgentsStreamPath } from '@/lib/api-paths'
import { useEffect, useRef } from 'react'

export type AgentDirectoryStreamEvent = {
  revision: string
  generated_at: string
}

type AgentDirectoryStreamOptions = {
  enabled?: boolean
  client_id?: string | null
  project_id?: string | null
  onSnapshot?: (event: AgentDirectoryStreamEvent) => void
  onUpdate?: (event: AgentDirectoryStreamEvent) => void
  onStatusChange?: (status: AuthenticatedSSEStatus) => void
}

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

function isRFC3339Nano(value: string): boolean {
  const match = timestampPattern.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return false

  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The roster stream carries invalidation metadata only, never agent read-model data. */
export function parseAgentDirectoryStreamEvent(raw: ServerSentEvent): AgentDirectoryStreamEvent | null {
  if (raw.event !== 'snapshot' && raw.event !== 'update') return null
  try {
    const value: unknown = JSON.parse(raw.data)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length !== 2 || !keys.includes('revision') || !keys.includes('generated_at')) return null
    if (typeof record.revision !== 'string' || !record.revision.trim()) return null
    if (typeof record.generated_at !== 'string' || !isRFC3339Nano(record.generated_at)) return null

    return { revision: record.revision, generated_at: record.generated_at }
  } catch {
    return null
  }
}

export function useAgentDirectoryStream({
  enabled = true,
  client_id,
  project_id,
  onSnapshot,
  onUpdate,
  onStatusChange,
}: AgentDirectoryStreamOptions = {}): { status: AuthenticatedSSEStatus } {
  const path = automationAgentsStreamPath({ client_id, project_id })
  const lastRevisionRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    // A replacement subscription starts with a fresh authoritative snapshot;
    // don't compare its opaque revision with a different stream's last value.
    lastRevisionRef.current = undefined
  }, [path])

  return useAuthenticatedSSE({
    path,
    enabled,
    parse: parseAgentDirectoryStreamEvent,
    onStatusChange,
    onEvent: (event, rawEvent) => {
      if (event.revision === lastRevisionRef.current) return
      lastRevisionRef.current = event.revision
      if (rawEvent.event === 'snapshot') onSnapshot?.(event)
      else if (rawEvent.event === 'update') onUpdate?.(event)
    },
  })
}
