'use client'

import type { Table } from '@/models/Table'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'

interface Props {
  tables: Table[]
  occupancy: Map<string, number> // table_id → seated count (including +1s)
  isOpen: boolean
  onToggle: () => void
  onTableClick: (tableId: string) => void
}

function fillColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'bg-surface-soft border-border-subtle'
  const pct = filled / capacity
  if (pct >= 0.9) return 'bg-red-500/80 border-red-400'
  if (pct >= 0.7) return 'bg-amber-400/80 border-amber-300'
  return 'bg-emerald-500/80 border-emerald-400'
}

function fillTextColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'text-ink-muted'
  const pct = filled / capacity
  if (pct >= 0.9) return 'text-red-300'
  if (pct >= 0.7) return 'text-amber-300'
  return 'text-emerald-300'
}

/**
 * Short labels for the mini map. Leading words shared by every table name
 * ("QA-AUTOTEST Mesa A", "QA-AUTOTEST Mesa B") are dropped, keeping the last
 * shared word, so the part that tells tables apart is what shows ("Mesa A",
 * "Mesa B"). The full name stays in the tooltip and accessible name (GST-64).
 */
export function miniMapLabels(names: string[]): string[] {
  const words = names.map((name) => name.trim().split(/\s+/))
  if (words.length < 2) return names
  let shared = 0
  while (words.every((w) => w.length > shared + 1 && w[shared] === words[0][shared])) shared++
  const drop = shared - 1
  if (drop <= 0) return names
  return words.map((w) => w.slice(drop).join(' '))
}

export function SeatingMiniMap({ tables, occupancy, isOpen, onToggle, onTableClick }: Props) {
  if (tables.length === 0) return null
  const labels = miniMapLabels(tables.map((table) => table.name))

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface/60">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-ink-secondary transition-colors hover:text-ink"
      >
        <span className="text-[10px] font-medium tracking-wide uppercase">
          Vista general — {tables.length} mesa{tables.length !== 1 ? 's' : ''}
        </span>
        <ChevronDownIcon className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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
            <div className="overflow-x-auto px-4 pb-4">
              <div className="flex min-w-0 flex-wrap gap-3">
                {tables.map((table, index) => {
                  const seated = occupancy.get(table.id) ?? 0
                  const pct = table.capacity > 0 ? Math.round((seated / table.capacity) * 100) : 0
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => onTableClick(table.id)}
                      className="group flex flex-col items-center gap-1"
                      title={`${table.name}: ${seated}/${table.capacity}`}
                      aria-label={`${table.name}: ${seated} de ${table.capacity} lugares`}
                    >
                      {/* Circle */}
                      <div
                        className={`flex size-9 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white transition-all duration-150 group-hover:scale-110 group-hover:shadow-lg ${fillColor(seated, table.capacity)} `}
                      >
                        {pct}%
                      </div>
                      {/* Label */}
                      <span
                        className={`line-clamp-2 w-[72px] text-center text-[10px] leading-tight [overflow-wrap:anywhere] break-words ${fillTextColor(seated, table.capacity)}`}
                      >
                        {labels[index]}
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
