'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

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

export function GuestStatusSelect({ guest, eventIdentifier, statuses }: Props) {
  const [loading, setLoading] = useState(false)
  const currentCode = guest.status?.code ?? 'PENDING'
  const colorClass = STATUS_BG[currentCode] ?? 'bg-zinc-800 text-zinc-400 border-white/10'

  // If statuses are not provided, render as plain select using only the code mapping
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value
    if (newCode === currentCode) return

    // Attempt status update: find status_id if catalog available, else send code
    const targetStatus = statuses?.find((s) => s.code === newCode)
    const payload = targetStatus
      ? { ...guest, status_id: targetStatus.id }
      : { ...guest, status_id: guest.status_id } // fallback: no-op if no catalog

    if (!targetStatus) {
      toast.error('Catálogo de estados no disponible. Usa el formulario de edición.')
      return
    }

    setLoading(true)
    try {
      await api.put(`/guests/${guest.id}`, payload)
      await mutate(`/guests/all:${eventId ?? eventIdentifier}`)
      toast.success(`Estado: ${STATUS_OPTIONS.find((s) => s.code === newCode)?.label}`)
    } catch {
      toast.error('Error al cambiar el estado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentCode}
        onChange={handleChange}
        disabled={loading || !statuses}
        title={!statuses ? 'Catálogo de estados no disponible' : undefined}
        className={[
          'appearance-none rounded-md border px-2.5 py-1 pr-6 text-xs font-medium transition-opacity focus:outline-none focus:ring-1 focus:ring-indigo-500',
          statuses ? 'cursor-pointer' : 'cursor-default',
          colorClass,
          loading ? 'opacity-50' : '',
        ].join(' ')}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-zinc-900 text-zinc-200">
            {opt.label}
          </option>
        ))}
      </select>
      {statuses && (
        <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-current opacity-60" />
      )}
    </div>
  )
}
