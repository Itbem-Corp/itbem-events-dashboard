'use client'

import { useState } from 'react'
import { Switch } from '@/components/switch'
import { api } from '@/lib/api'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import type { User } from '@/models/User'

export function UserActiveToggle({
    user,
    disabled,
}: {
    user: Pick<User, 'id' | 'is_active'>
    disabled?: boolean
}) {
    const { mutate } = useSWRConfig()
    const [pending, setPending] = useState(false)

    const toggle = async () => {
        if (pending) return
        setPending(true)

        const endpoint = user.is_active
            ? `/users/${user.id}/deactivate`
            : `/users/${user.id}/activate`

        try {
            await mutate<User[]>(
                '/users/all',
                async (current = []) => {
                    await api.put(endpoint)
                    return current.map(u =>
                        u.id === user.id ? { ...u, is_active: !user.is_active } : u
                    )
                },
                {
                    optimisticData: (current = []) =>
                        current.map(u =>
                            u.id === user.id ? { ...u, is_active: !user.is_active } : u
                        ),
                    rollbackOnError: true,
                    revalidate: false,
                }
            )
            toast.success(user.is_active ? 'Usuario desactivado' : 'Usuario activado')
        } catch {
            toast.error('No se pudo cambiar el estado del usuario')
        } finally {
            setPending(false)
        }
    }

    return (
        <Switch
            checked={!!user.is_active}
            disabled={disabled || pending}
            onChange={toggle}
        />
    )
}
