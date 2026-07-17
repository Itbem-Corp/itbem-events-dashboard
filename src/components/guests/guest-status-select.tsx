'use client'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventGuestSummaryPath, guestPath } from '@/lib/api-paths'
import { buildGuestStatusCachePatch, eventGuestsCacheKeyFilter, patchGuestCacheValue } from '@/lib/guest-cache'
import {
  buildGuestStatusUpdatePayload,
  findGuestStatusByCode,
  getEffectiveStatus,
  type GuestStatusCode,
} from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import { toast } from 'sonner'
import { mutate } from 'swr'

const STATUS_OPTIONS: { code: string; label: string }[] = [
  { code: 'PENDING', label: 'Pendiente' },
  { code: 'CONFIRMED', label: 'Confirmado' },
  { code: 'DECLINED', label: 'Declinado' },
]

const STATUS_BG: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  CONFIRMED: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
  DECLINED: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
}

interface Props {
  guest: Guest
  eventIdentifier: string
  eventId?: string
  /**
   * Pass pre-fetched statuses to avoid duplicate requests when used inside a list.
   * If not provided, falls back to read-only badge.
   */
  statuses?: GuestStatus[]
}

export function GuestStatusSelect({ guest, eventIdentifier, eventId, statuses }: Props) {
  const [loading, setLoading] = useState(false)
  const currentCode = getEffectiveStatus(guest)
  const colorClass = STATUS_BG[currentCode] ?? 'bg-surface-raised text-ink-secondary border-white/10'

  // If statuses are not provided, render as plain select using only the code mapping
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value as GuestStatusCode
    if (newCode === currentCode) return

    const targetStatus = findGuestStatusByCode(statuses, newCode)

    if (!targetStatus) {
      toast.error('Catálogo de estados no disponible. Usa el formulario de edición.')
      return
    }

    const payload = buildGuestStatusUpdatePayload(targetStatus)
    const optimisticGuest = { ...guest, ...buildGuestStatusCachePatch(targetStatus, payload) }
    const targetEventId = eventId ?? guest.event_id ?? eventIdentifier
    const cacheFilter = eventGuestsCacheKeyFilter(targetEventId)
    setLoading(true)
    try {
      await mutate(
        cacheFilter,
        (current: unknown) => patchGuestCacheValue(current, guest.id, optimisticGuest),
        { revalidate: false }
      )
      const res = await api.put(guestPath(guest.id), payload)
      const updatedGuest = readApiData<Guest | null>(res.data)
      if (updatedGuest?.id) {
        await mutate(
          cacheFilter,
          (current: unknown) => patchGuestCacheValue(current, guest.id, updatedGuest),
          { revalidate: false }
        )
      } else void mutate(cacheFilter)
      const summaryEventId = eventId ?? guest.event_id
      if (summaryEventId) void mutate(eventGuestSummaryPath(summaryEventId))
      toast.success(`Estado: ${STATUS_OPTIONS.find((s) => s.code === newCode)?.label}`)
    } catch (err: unknown) {
      await mutate(
        cacheFilter,
        (current: unknown) => patchGuestCacheValue(current, guest.id, guest),
        { revalidate: false }
      )
      toast.error(getApiErrorMessage(err, 'Error al cambiar el estado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={`Estado de ${`${guest.first_name ?? ''} ${guest.last_name ?? ''}`.trim() || 'invitado'}`}
        value={currentCode}
        onChange={handleChange}
        disabled={loading || !statuses}
        title={!statuses ? 'Catálogo de estados no disponible' : undefined}
        className={[
          'appearance-none rounded-md border px-2.5 py-1 pr-6 text-xs font-medium transition-opacity focus:ring-1 focus:ring-indigo-500 focus:outline-none',
          statuses ? 'cursor-pointer' : 'cursor-default',
          colorClass,
          loading ? 'opacity-50' : '',
        ].join(' ')}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-surface text-ink">
            {opt.label}
          </option>
        ))}
      </select>
      {statuses && (
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-current opacity-60" />
      )}
    </div>
  )
}
