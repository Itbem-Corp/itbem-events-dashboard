'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { ArrowsRightLeftIcon } from '@heroicons/react/16/solid'
import type { Guest } from '@/models/Guest'

interface GuestChipProps {
  guest: Guest
  onMobileTap?: (guest: Guest) => void
  isDraggable?: boolean
}

export function GuestChip({ guest, onMobileTap, isDraggable = true }: GuestChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: guest.id,
    data: { type: 'guest', guest },
    disabled: !isDraggable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isConfirmed = guest.status?.code === 'CONFIRMED'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
        'cursor-grab active:cursor-grabbing touch-none',
        isDragging ? 'z-50 shadow-lg shadow-indigo-500/20' : '',
        isConfirmed ? 'border-lime-500/20 bg-lime-500/5' : 'border-white/10 bg-zinc-900/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-zinc-200 truncate">
          {guest.first_name} {guest.last_name}
        </span>
        {guest.guests_count > 1 && (
          <span className="text-zinc-600 flex-shrink-0">+{guest.guests_count - 1}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <GuestStatusBadge status={guest.status} />
        {onMobileTap && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMobileTap(guest)
            }}
            className="md:hidden rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            aria-label="Mover invitado"
          >
            <ArrowsRightLeftIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
