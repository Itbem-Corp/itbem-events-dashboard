'use client'

import { Switch } from '@/components/switch'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventPath } from '@/lib/api-paths'
import { isEventCacheKey, isEventOverviewCacheKey, patchEventCacheValue } from '@/lib/event-cache'
import { trackProductEvent } from '@/lib/product-analytics'
import type { Event } from '@/models/Event'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'

interface Props {
  event: Pick<Event, 'id' | 'is_active' | 'name'>
  onPublicContentChanged?: () => void
}

export function EventActiveToggle({ event, onPublicContentChanged }: Props) {
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)

    const nextActive = !event.is_active
    const patchCaches = (isActive: boolean, updated?: Event | null) =>
      mutate(
        (key) => isEventCacheKey(key, event.id),
        (current: unknown) =>
          patchEventCacheValue(current, event.id, updated ? { ...updated, is_active: isActive } : { is_active: isActive }),
        { revalidate: false }
      )

    try {
      await patchCaches(nextActive)
      const res = await api.put<Event>(eventPath(event.id), { is_active: nextActive })
      const updated = readApiData<Event | null>(res.data)
      if (updated) await patchCaches(nextActive, updated)
      else void mutate((key) => isEventCacheKey(key, event.id))
      void mutate(isEventOverviewCacheKey)
      onPublicContentChanged?.()
      trackProductEvent(nextActive ? 'event_published' : 'event_unpublished', { trigger: 'active_toggle' })
      toast.success(nextActive ? `"${event.name}" activado` : `"${event.name}" desactivado`)
    } catch (err: unknown) {
      await patchCaches(event.is_active)
      toast.error(getApiErrorMessage(err, 'No se pudo cambiar el estado del evento'))
    } finally {
      setPending(false)
    }
  }

  return <Switch checked={event.is_active} disabled={pending} onChange={toggle} />
}
