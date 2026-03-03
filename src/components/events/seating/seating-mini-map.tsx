'use client'

import { motion, AnimatePresence } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import type { Table } from '@/models/Table'

interface Props {
  tables: Table[]
  occupancy: Map<string, number>   // table_id → seated count (including +1s)
  isOpen: boolean
  onToggle: () => void
  onTableClick: (tableId: string) => void
}

function fillColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'bg-zinc-700 border-zinc-600'
  const pct = filled / capacity
  if (pct >= 0.9) return 'bg-red-500/80 border-red-400'
  if (pct >= 0.7) return 'bg-amber-400/80 border-amber-300'
  return 'bg-emerald-500/80 border-emerald-400'
}

function fillTextColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'text-zinc-500'
  const pct = filled / capacity
  if (pct >= 0.9) return 'text-red-300'
  if (pct >= 0.7) return 'text-amber-300'
  return 'text-emerald-300'
}

export function SeatingMiniMap({ tables, occupancy, isOpen, onToggle, onTableClick }: Props) {
  if (tables.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span className="font-medium tracking-wide uppercase text-[10px]">
          Vista general — {tables.length} mesa{tables.length !== 1 ? 's' : ''}
        </span>
        <ChevronDownIcon
          className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Map body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 overflow-x-auto">
              <div className="flex gap-3 min-w-0 flex-wrap">
                {tables.map((table) => {
                  const seated = occupancy.get(table.id) ?? 0
                  const pct = table.capacity > 0 ? Math.round((seated / table.capacity) * 100) : 0
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => onTableClick(table.id)}
                      className="flex flex-col items-center gap-1 group"
                      title={`${table.name}: ${seated}/${table.capacity}`}
                    >
                      {/* Circle */}
                      <div
                        className={`
                          size-9 rounded-full border-2 flex items-center justify-center
                          text-[10px] font-bold text-white transition-all duration-150
                          group-hover:scale-110 group-hover:shadow-lg
                          ${fillColor(seated, table.capacity)}
                        `}
                      >
                        {pct}%
                      </div>
                      {/* Label */}
                      <span
                        className={`text-[10px] max-w-[52px] truncate leading-tight ${fillTextColor(seated, table.capacity)}`}
                      >
                        {table.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
