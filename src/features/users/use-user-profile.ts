'use client'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { usersPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { UserProfileResponse } from '@/models/User'
import { useStore } from '@/store/useStore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

type ComparableProfile = Pick<UserProfileResponse, 'id' | 'email' | 'first_name' | 'last_name'> &
  Partial<Pick<UserProfileResponse, 'profile_image' | 'is_active' | 'is_root'>>

function isSameProfile(current: ComparableProfile | null, next: UserProfileResponse): boolean {
  return Boolean(
    current &&
      current.id === next.id &&
      current.email === next.email &&
      current.first_name === next.first_name &&
      current.last_name === next.last_name &&
      (current.profile_image ?? '') === (next.profile_image ?? '') &&
      current.is_active === next.is_active &&
      current.is_root === next.is_root
  )
}

function toProfileResponse(user: ComparableProfile | null): UserProfileResponse | undefined {
  if (!user) return undefined
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    profile_image: user.profile_image ?? '',
    is_active: user.is_active ?? true,
    is_root: user.is_root ?? false,
  }
}

/** Owns the profile's remote data, session synchronization and optimistic updates. */
export function useUserProfile() {
  const storedUser = useStore((state) => state.user)
  const setProfile = useStore((state) => state.setProfile)
  const persistedProfile = useMemo(() => toProfileResponse(storedUser), [storedUser])
  const {
    data: freshProfile,
    error: profileError,
    isValidating: profileRetrying,
    mutate: retryProfile,
  } = useSWR<UserProfileResponse>(usersPath(), fetcher, {
    ...responsiveListSwrOptions,
    fallbackData: persistedProfile,
  })
  const user = freshProfile ?? persistedProfile
  const profileErrorState = getDataErrorState(profileError, user)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!user || isDirty || loading) return
    setFirstName(user.first_name || '')
    setLastName(user.last_name || '')
  }, [isDirty, loading, user])

  useEffect(() => {
    if (freshProfile && !isSameProfile(storedUser, freshProfile)) setProfile(freshProfile)
  }, [freshProfile, setProfile, storedUser])

  const updateFirstName = useCallback((value: string) => {
    setFirstName(value)
    setIsDirty(true)
  }, [])
  const updateLastName = useCallback((value: string) => {
    setLastName(value)
    setIsDirty(true)
  }, [])

  const updateAvatar = useCallback(
    (profileImage: string | null) => {
      if (!user) return
      const nextProfile = { ...user, profile_image: profileImage ?? '' }
      setProfile(nextProfile)
      void retryProfile(nextProfile, { revalidate: false })
    },
    [retryProfile, setProfile, user]
  )

  const saveProfile = useCallback(async () => {
    if (!user) return
    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    if (!normalizedFirstName || !normalizedLastName) return

    const snapshot = user
    const optimisticProfile: UserProfileResponse = {
      ...snapshot,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
    }
    setLoading(true)
    setProfile(optimisticProfile)
    await retryProfile(optimisticProfile, { revalidate: false })
    try {
      const response = await api.put<UserProfileResponse>(usersPath(), {
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
      })
      const nextProfile = readApiData<UserProfileResponse>(response.data)
      setProfile(nextProfile)
      await retryProfile(nextProfile, { revalidate: false })
      setIsDirty(false)
      toast.success('Perfil guardado correctamente')
    } catch (error) {
      setProfile(snapshot)
      await retryProfile(snapshot, { revalidate: false })
      toast.error(getApiErrorMessage(error, 'Error al guardar el perfil'))
    } finally {
      setLoading(false)
    }
  }, [firstName, lastName, retryProfile, setProfile, user])

  return {
    user,
    profileErrorState,
    profileRetrying,
    retryProfile,
    firstName,
    lastName,
    loading,
    isDirty,
    hasValidName: firstName.trim().length > 0 && lastName.trim().length > 0,
    updateFirstName,
    updateLastName,
    updateAvatar,
    saveProfile,
  }
}
