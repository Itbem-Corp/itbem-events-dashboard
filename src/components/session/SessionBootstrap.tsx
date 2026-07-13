'use client'

import { usersPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import type { UserProfileResponse } from '@/models/User'
import { useStore } from '@/store/useStore'
import { useEffect } from 'react'
import useSWR from 'swr'

export default function SessionBootstrap() {
  const hydrated = useStoreHydration()
  const profileLoaded = useStore((s) => s.profileLoaded)
  const setProfile = useStore((s) => s.setProfile)

  const { data: profile } = useSWR<UserProfileResponse>(hydrated && !profileLoaded ? usersPath() : null, fetcher, {
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (profile) setProfile(profile)
  }, [profile, setProfile])

  return null
}
