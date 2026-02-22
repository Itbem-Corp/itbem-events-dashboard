'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useStore } from '@/store/useStore'

export default function SessionBootstrap() {
    const token = useStore((s) => s.token)
    const profileLoaded = useStore((s) => s.profileLoaded)
    const setProfile = useStore((s) => s.setProfile)
    const clearSession = useStore((s) => s.clearSession)

    useEffect(() => {
        if (!token || profileLoaded) return

        api.get('/users')
            .then((res) => {
                setProfile(res.data.data ?? res.data)
            })
            .catch(() => {
                clearSession()
            })
    }, [token, profileLoaded, setProfile, clearSession])

    return null
}
