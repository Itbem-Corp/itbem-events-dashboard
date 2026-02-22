'use client'

import { motion, AnimatePresence } from 'motion/react'
import { XMarkIcon } from '@heroicons/react/16/solid'
import { PlusIcon } from '@heroicons/react/20/solid'
import type { Table } from '@/models/Table'
import type { Guest } from '@/models/Guest'

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
  if (!guest) return null

  return (
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
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-white/10 bg-zinc-900 pb-safe"
          >
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-zinc-700" />
            </div>

            <div className="px-4 pb-6 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Asignar a {guest.first_name} {guest.last_name}
                  </p>
                  {guest.guests_count > 1 && (
                    <p className="text-xs text-zinc-500">+{guest.guests_count - 1} acompañantes</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
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
                  className="w-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Quitar de mesa actual
                </button>
              )}

              <div className="space-y-1.5">
                {tables.map((table) => {
                  const occupancy = tableOccupancy.get(table.id) ?? 0
                  const isFull = occupancy >= table.capacity
                  const isCurrentTable = currentTableId === table.id

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
                          ? 'border-indigo-500/30 bg-indigo-500/10 cursor-default'
                          : isFull
                            ? 'border-white/5 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                            : 'border-white/10 bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-indigo-500/30',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-200">{table.name}</span>
                        <span
                          className={[
                            'text-xs tabular-nums',
                            isFull ? 'text-red-400' : 'text-zinc-500',
                          ].join(' ')}
                        >
                          {occupancy}/{table.capacity}
                        </span>
                      </div>
                      {isCurrentTable && (
                        <p className="text-xs text-indigo-400 mt-0.5">Mesa actual</p>
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
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-indigo-500/30 transition-colors"
              >
                <PlusIcon className="size-4" />
                Crear nueva mesa
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
