'use client'

import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePageActivity } from '@/hooks/usePageActivity'
import { apiRequestHeaders, apiUrl } from '@/lib/api'
import { consumeServerSentEvents, type ServerSentEvent } from '@/lib/realtime/server-sent-events'
import { useEffect, useRef, useState } from 'react'

export type AuthenticatedSSEStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'

type AuthenticatedSSEOptions<T> = {
  path: string | null
  enabled?: boolean
  parse: (event: ServerSentEvent) => T | null
  onEvent?: (event: T, rawEvent: ServerSentEvent) => void
  onStatusChange?: (status: AuthenticatedSSEStatus) => void
}

const initialReconnectDelay = 750
const maximumReconnectDelay = 12_000

async function openAuthenticatedSSE(path: string, signal: AbortSignal): Promise<Response> {
  const request = async (forceRefresh = false) => fetch(apiUrl(path), {
    method: 'GET',
    cache: 'no-store',
    signal,
    headers: {
      ...(await apiRequestHeaders(forceRefresh)),
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })

  let response = await request()
  // Axios normally refreshes a stale token once. Streams use fetch to preserve
  // the response body, so mirror that bounded recovery here.
  if (response.status === 401 && !signal.aborted) response = await request(true)
  return response
}

export function useAuthenticatedSSE<T>({
  path,
  enabled = true,
  parse,
  onEvent,
  onStatusChange,
}: AuthenticatedSSEOptions<T>): { status: AuthenticatedSSEStatus } {
  const online = useOnlineStatus()
  const pageActive = usePageActivity()
  const callbacks = useRef({ parse, onEvent, onStatusChange })
  const [status, setStatus] = useState<AuthenticatedSSEStatus>('idle')

  useEffect(() => {
    callbacks.current = { parse, onEvent, onStatusChange }
  }, [onEvent, onStatusChange, parse])

  useEffect(() => {
    if (!enabled || !path) {
      setStatus('idle')
      return
    }
    if (!online || !pageActive) {
      setStatus('offline')
      return
    }

    let disposed = false
    let retryDelay = initialReconnectDelay
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    // The Delivery stream intentionally rolls over after a short, healthy
    // lifetime so authorization is refreshed. That is not a user-visible
    // outage: retain the live affordance during the tiny handoff instead of
    // flashing “Reconectando” every time the server renews the channel.
    let hasEstablishedStream = false

    const publishStatus = (next: AuthenticatedSSEStatus) => {
      if (disposed) return
      setStatus(next)
      callbacks.current.onStatusChange?.(next)
    }

    const scheduleReconnect = (delay: number) => {
      if (disposed) return
      reconnectTimer = setTimeout(() => void connect(), delay)
    }

    const connect = async () => {
      controller = new AbortController()
      if (!hasEstablishedStream) {
        publishStatus(retryDelay === initialReconnectDelay ? 'connecting' : 'reconnecting')
      }
      let connected = false
      let streamFailed = false

      try {
        const response = await openAuthenticatedSSE(path, controller.signal)
        if (!response.ok || !response.body) {
          throw new Error(`SSE request failed with status ${response.status}`)
        }

        connected = true
        hasEstablishedStream = true
        retryDelay = initialReconnectDelay
        publishStatus('live')
        await consumeServerSentEvents(response.body, (rawEvent) => {
          const event = callbacks.current.parse(rawEvent)
          if (event) callbacks.current.onEvent?.(event, rawEvent)
        }, controller.signal)
      } catch {
        if (disposed || controller.signal.aborted) return
        streamFailed = true
        publishStatus('error')
      }

      if (disposed || controller.signal.aborted) return
      const delay = connected ? initialReconnectDelay : retryDelay
      retryDelay = Math.min(Math.round(retryDelay * 1.8), maximumReconnectDelay)
      // A clean EOF is the normal server-side authorization rollover. Keep
      // the current live pulse while the next connection is opened; an actual
      // failed read still communicates its recovery state explicitly.
      if (streamFailed) publishStatus('reconnecting')
      scheduleReconnect(delay)
    }

    void connect()
    return () => {
      disposed = true
      controller?.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [enabled, online, pageActive, path])

  return { status }
}
