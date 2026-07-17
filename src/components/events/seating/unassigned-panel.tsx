'use client'

import { Pagination } from '@/components/ui/pagination'
import type { Guest } from '@/models/Guest'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ExclamationCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { useDeferredValue, useMemo, useState } from 'react'
import { GuestChip } from './guest-chip'

interface UnassignedPanelProps {
  guests: Guest[]
  onMobileAssign?: (guest: Guest) => void
}

const UNASSIGNED_PAGE_SIZE = 30

export function UnassignedPanel({ guests, onMobileAssign }: UnassignedPanelProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return guests
    const q = deferredSearch.toLowerCase()
    return guests.filter(
      (g) =>
        g.first_name.toLowerCase().includes(q) ||
        g.last_name.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q)
    )
  }, [deferredSearch, guests])
  const pageCount = Math.max(1, Math.ceil(filtered.length / UNASSIGNED_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleGuests = filtered.slice((currentPage - 1) * UNASSIGNED_PAGE_SIZE, currentPage * UNASSIGNED_PAGE_SIZE)

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  })

  const guestIds = visibleGuests.map((g) => g.id)

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex h-full flex-col overflow-hidden rounded-xl border transition-colors duration-150',
        isOver ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30' : 'border-amber-500/20 bg-amber-500/5',
      ].join(' ')}
    >
      <div className="border-b border-amber-500/20 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ExclamationCircleIcon className="size-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Sin mesa</span>
          </div>
          <span className="text-xs font-medium text-amber-400 tabular-nums">{guests.length}</span>
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-busy={search !== deferredSearch}
            placeholder="Buscar invitado..."
            className="w-full rounded-lg border border-white/10 bg-surface/50 py-1.5 pr-3 pl-8 text-xs text-ink placeholder:text-ink-muted focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
          />
        </div>
      </div>

      <SortableContext items={guestIds} strategy={verticalListSortingStrategy}>
        <div data-unassigned-list className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-muted">{search ? 'Sin resultados' : 'Todos asignados'}</p>
          ) : (
            visibleGuests.map((g) => <GuestChip key={g.id} guest={g} onMobileTap={onMobileAssign} />)
          )}
        </div>
      </SortableContext>
      <div className="px-3 pb-3">
        <Pagination total={filtered.length} page={currentPage} pageSize={UNASSIGNED_PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  )
}
