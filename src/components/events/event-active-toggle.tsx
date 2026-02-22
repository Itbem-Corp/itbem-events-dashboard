'use client'

import { useState } from 'react'
import { Switch } from '@/components/switch'
import { api } from '@/lib/api'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import type { Event } from '@/models/Event'

interface Props {
  event: Pick<Event, 'id' | 'is_active' | 'name'>
}

export function EventActiveToggle({ event }: Props) {
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)

    const nextActive = !event.is_active

    try {
      await mutate<Event[]>(
        '/events/all',
        async (current = []) => {
          await api.put(`/events/${event.id}`, { ...event, is_active: nextActive })
          return current.map((e) =>
            e.id === event.id ? { ...e, is_active: nextActive } : e
          )
        },
        {
          optimisticData: (current = []) =>
            current.map((e) =>
              e.id === event.id ? { ...e, is_active: nextActive } : e
            ),
          rollbackOnError: true,
          revalidate: false,
        }
      )
      toast.success(nextActive ? `"${event.name}" activado` : `"${event.name}" desactivado`)
    } catch {
      toast.error('No se pudo cambiar el estado del evento')
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      checked={event.is_active}
      disabled={pending}
      onChange={toggle}
    />
  )
}
