'use client'

import { getGuestCompanionCount } from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'
import { XMarkIcon } from '@heroicons/react/16/solid'
import { PlusIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { checkSeat } from './seating-capacity'

interface AssignBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  guest: Guest | null
  currentTableId: string | null
  tables: Table[]
  tableOccupancy: Map<string, number>
  onAssign: (guestId: string, tableId: string | null) => void
  onCreateTable: () => void
}

export function AssignBottomSheet({
  isOpen,
  onClose,
  guest,
  currentTableId,
  tables,
  tableOccupancy,
  onAssign,
  onCreateTable,
}: AssignBottomSheetProps) {
  if (!guest || typeof document === 'undefined') return null
  const companionCount = getGuestCompanionCount(guest)

  // Portaled to body so no transformed ancestor can trap it under the mobile tab bar (GST-N3).
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-sheet-title"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(80dvh,40rem)] flex-col rounded-t-2xl border-t border-white/10 bg-surface"
          >
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-surface-soft" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p id="assign-sheet-title" className="text-sm font-semibold text-ink">
                    Asignar a {guest.first_name} {guest.last_name}
                  </p>
                  {companionCount > 0 && <p className="text-xs text-ink-muted">+{companionCount} acompañantes</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink-secondary"
                >
                  <XMarkIcon className="size-5" />
                </button>
              </div>

              {currentTableId && (
                <button
                  onClick={() => {
                    onAssign(guest.id, null)
                    onClose()
                  }}
                  className="mb-2 w-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                  Quitar de mesa actual
                </button>
              )}

              <div className="space-y-1.5">
                {tables.map((table) => {
                  const occupancy = tableOccupancy.get(table.id) ?? 0
                  const isCurrentTable = currentTableId === table.id
                  // Same strict rule as drag and drop: the whole party must fit (SEAT-1).
                  const seat = checkSeat(table, tableOccupancy, guest, currentTableId)
                  const isFull = !isCurrentTable && !seat.ok

                  return (
                    <button
                      key={table.id}
                      disabled={isFull || isCurrentTable}
                      onClick={() => {
                        onAssign(guest.id, table.id)
                        onClose()
                      }}
                      className={[
                        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                        isCurrentTable
                          ? 'cursor-default border-indigo-500/30 bg-indigo-500/10'
                          : isFull
                            ? 'cursor-not-allowed border-white/5 bg-surface/30 opacity-50'
                            : 'border-white/10 bg-surface/30 hover:border-indigo-500/30 hover:bg-surface-raised/50',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">{table.name}</span>
                        <span
                          className={['text-xs tabular-nums', isFull ? 'text-red-400' : 'text-ink-muted'].join(' ')}
                        >
                          {occupancy}/{table.capacity}
                        </span>
                      </div>
                      {isCurrentTable && <p className="mt-0.5 text-xs text-indigo-400">Mesa actual</p>}
                      {isFull && (
                        <p className="mt-0.5 text-xs text-red-400">
                          Sin lugar suficiente: quedan {seat.free}, se necesitan {seat.needed}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => {
                  onCreateTable()
                  onClose()
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-ink-secondary transition-colors hover:border-indigo-500/30 hover:text-ink"
              >
                <PlusIcon className="size-4" />
                Crear nueva mesa
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
