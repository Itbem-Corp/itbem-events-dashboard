'use client'

import { Switch } from '@/components/switch'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { userActivatePath, userDeactivatePath } from '@/lib/api-paths'
import { isUsersAllCacheKey, patchUserCacheValue, upsertUserCacheValue } from '@/lib/user-cache'
import type { AdminUserListItemResponse, AdminUserResponse } from '@/models/User'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'

export function UserActiveToggle({
  user,
  disabled,
}: {
  user: Pick<AdminUserListItemResponse, 'id' | 'is_active'>
  disabled?: boolean
}) {
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)

    const endpoint = user.is_active ? userDeactivatePath(user.id) : userActivatePath(user.id)
    const nextActive = !user.is_active
    const patchUser = (current: unknown) =>
      patchUserCacheValue(current, user.id, { is_active: nextActive })

    try {
      await mutate(isUsersAllCacheKey, patchUser, { revalidate: false })

      const res = await api.put<AdminUserResponse>(endpoint)
      const updated = readApiData<AdminUserResponse | null>(res.data)
      await mutate(
        isUsersAllCacheKey,
        (current: unknown) =>
          updated ? upsertUserCacheValue(current, { ...updated, is_active: nextActive }) : patchUser(current),
        { revalidate: false }
      )
      if (!updated) void mutate(isUsersAllCacheKey)
      toast.success(user.is_active ? 'Usuario desactivado' : 'Usuario activado')
    } catch (err: unknown) {
      await mutate(
        isUsersAllCacheKey,
        (current: unknown) => patchUserCacheValue(current, user.id, { is_active: user.is_active }),
        { revalidate: false }
      )
      toast.error(getApiErrorMessage(err, 'No se pudo cambiar el estado del usuario'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      checked={!!user.is_active}
      disabled={disabled || pending}
      onChange={toggle}
      aria-label={user.is_active ? 'Desactivar acceso del usuario' : 'Reactivar acceso del usuario'}
    />
  )
}
