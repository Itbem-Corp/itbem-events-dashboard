'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import {
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CapacityRing } from './capacity-ring'
import { GuestChip } from './guest-chip'
import type { Table } from '@/models/Table'
import type { Guest } from '@/models/Guest'

interface TableCardProps {
  table: Table
  guests: Guest[]
  onEdit: (table: Table) => void
  onDelete: (tableId: string) => void
  onMobileAssign?: (guest: Guest) => void
  index: number
}

export function TableCard({
  table,
  guests,
  onEdit,
  onDelete,
  onMobileAssign,
  index,
}: TableCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `table-${table.id}`,
    data: { type: 'table', tableId: table.id },
  })

  const totalAttendees = guests.reduce((sum, g) => sum + (g.guests_count ?? 1), 0)
  const guestIds = guests.map((g) => g.id)

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={[
        'rounded-xl border overflow-hidden transition-colors duration-150',
        isOver
          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
          : 'border-white/10 bg-zinc-900/30',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50">
        <div className="flex items-center gap-3 min-w-0">
          <CapacityRing current={totalAttendees} capacity={table.capacity} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200 truncate">{table.name}</p>
            <p className="text-xs text-zinc-500">
              {guests.length} inv. · {totalAttendees} asist.
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Opciones de mesa" className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <EllipsisVerticalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(table)}>
              <PencilIcon className="size-3.5 mr-2" />
              Editar mesa
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(table.id)}
            >
              <TrashIcon className="size-3.5 mr-2" />
              Eliminar mesa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Guests */}
      <SortableContext items={guestIds} strategy={verticalListSortingStrategy}>
        <div className="p-3 space-y-1.5 min-h-[60px]">
          {guests.length === 0 ? (
            <p className="text-xs text-zinc-700 text-center py-4">
              Arrastra invitados aquí
            </p>
          ) : (
            guests.map((g) => (
              <GuestChip key={g.id} guest={g} onMobileTap={onMobileAssign} />
            ))
          )}

          {totalAttendees < table.capacity && guests.length > 0 && (
            <div className="flex gap-1 pt-1">
              {Array.from({ length: Math.min(table.capacity - totalAttendees, 5) }).map(
                (_, i) => (
                  <div
                    key={i}
                    className="size-2 rounded-full bg-zinc-800 border border-zinc-700"
                  />
                ),
              )}
              {table.capacity - totalAttendees > 5 && (
                <span className="text-[10px] text-zinc-700">
                  +{table.capacity - totalAttendees - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </SortableContext>
    </motion.div>
  )
}
