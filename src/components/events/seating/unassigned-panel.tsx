'use client'

import { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid'
import { GuestChip } from './guest-chip'
import type { Guest } from '@/models/Guest'

interface UnassignedPanelProps {
  guests: Guest[]
  onMobileAssign?: (guest: Guest) => void
}

export function UnassignedPanel({ guests, onMobileAssign }: UnassignedPanelProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return guests
    const q = search.toLowerCase()
    return guests.filter(
      (g) =>
        g.first_name.toLowerCase().includes(q) ||
        g.last_name.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q),
    )
  }, [guests, search])

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  })

  const guestIds = filtered.map((g) => g.id)

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-xl border overflow-hidden transition-colors duration-150 h-full flex flex-col',
        isOver
          ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
          : 'border-amber-500/20 bg-amber-500/5',
      ].join(' ')}
    >
      <div className="px-4 py-3 border-b border-amber-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ExclamationCircleIcon className="size-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Sin mesa</span>
          </div>
          <span className="text-xs font-medium text-amber-400 tabular-nums">
            {guests.length}
          </span>
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar invitado..."
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>
      </div>

      <SortableContext items={guestIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">
              {search ? 'Sin resultados' : 'Todos asignados'}
            </p>
          ) : (
            filtered.map((g) => (
              <GuestChip key={g.id} guest={g} onMobileTap={onMobileAssign} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
