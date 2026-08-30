'use client'

import { SESSION_SYNC_STORAGE_KEY, endSession } from '@/lib/end-session'
import {
  SESSION_FOCUS_REVALIDATE_AFTER_MS,
  SESSION_REVALIDATE_INTERVAL_MS,
  getApplicationSession,
  refreshApplicationSession,
} from '@/lib/api'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { useStore } from '@/store/useStore'
import { useEffect } from 'react'
import useSWR from 'swr'

type RequestStatusError = {
  status?: number
  response?: { status?: number }
}

function requestStatus(error: unknown): number | undefined {
  const candidate = error as RequestStatusError | undefined
  return candidate?.status ?? candidate?.response?.status
}

export default function SessionBootstrap() {
  const hydrated = useStoreHydration()
  const profileLoaded = useStore((s) => s.profileLoaded)
  const setApplicationSession = useStore((s) => s.setApplicationSession)
  const clearSession = useStore((s) => s.clearSession)

  const { data: session, error } = useSWR<ApplicationSession>(
    hydrated && !profileLoaded ? 'application-session' : null,
    getApplicationSession,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: (requestError) => {
        const status = requestStatus(requestError)
        return status !== 401 && status !== 403
      },
    }
  )

  useEffect(() => {
    if (session) setApplicationSession(session)
  }, [session, setApplicationSession])

  useEffect(() => {
    const status = requestStatus(error)
    if (status === 401 || status === 403) {
      void endSession(clearSession)
    }
  }, [clearSession, error])

  useEffect(() => {
    if (!hydrated || !profileLoaded) return

    let active = true
    const revalidate = async (minAgeMs = 0) => {
      try {
        await refreshApplicationSession(minAgeMs)
      } catch (reason) {
        const status = requestStatus(reason)
        if (active && (status === 401 || status === 403)) void endSession(clearSession)
      }
    }
    // The Zustand state can survive Fast Refresh and client navigations. Treat
    // it as a cache and verify it once before it can drive a workspace request.
    void revalidate(0)
    const intervalId = window.setInterval(() => { void revalidate() }, SESSION_REVALIDATE_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void revalidate(SESSION_FOCUS_REVALIDATE_AFTER_MS)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [clearSession, hydrated, profileLoaded])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const leaveLocally = () => {
      clearSession()
      window.location.assign('/login')
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_SYNC_STORAGE_KEY && event.newValue) leaveLocally()
    }
    window.addEventListener('storage', onStorage)

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(SESSION_SYNC_STORAGE_KEY)
      channel.onmessage = () => leaveLocally()
    } catch {}

    return () => {
      window.removeEventListener('storage', onStorage)
      channel?.close()
    }
  }, [clearSession])

  return null
}
