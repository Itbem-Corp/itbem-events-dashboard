'use client'

import { applicationSessionPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { useStore } from '@/store/useStore'
import { useEffect } from 'react'
import useSWR from 'swr'

export default function SessionBootstrap() {
  const hydrated = useStoreHydration()
  const profileLoaded = useStore((s) => s.profileLoaded)
  const setApplicationSession = useStore((s) => s.setApplicationSession)

  const { data: session, error } = useSWR<ApplicationSession>(
    hydrated && !profileLoaded ? applicationSessionPath() : null,
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: (requestError) =>
        (requestError as { response?: { status?: number } })?.response?.status !== 403,
    }
  )

  useEffect(() => {
    if (session) setApplicationSession(session)
  }, [session, setApplicationSession])

  useEffect(() => {
    if ((error as { response?: { status?: number } })?.response?.status === 403) {
      window.location.assign('/logout?reason=application-access')
    }
  }, [error])

  return null
}
