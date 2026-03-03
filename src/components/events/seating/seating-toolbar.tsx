'use client'

import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, ArrowUturnLeftIcon, SparklesIcon, PrinterIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/button'

interface SeatingToolbarProps {
  pendingCount: number
  canUndo: boolean
  saving: boolean
  canAutoAssign: boolean
  onCreateTable: () => void
  onSave: () => void
  onDiscard: () => void
  onUndo: () => void
  onAutoAssign: () => void
  onPrint: () => void
  // Stats
  totalSeated: number
  totalCapacity: number
  unassignedCount: number
  tableCount: number
}

export function SeatingToolbar({
  pendingCount,
  canUndo,
  saving,
  canAutoAssign,
  onCreateTable,
  onSave,
  onDiscard,
  onUndo,
  onAutoAssign,
  onPrint,
  totalSeated,
  totalCapacity,
  unassignedCount,
  tableCount,
}: SeatingToolbarProps) {
  return (
    <>
      <div className="space-y-3 print:hidden">
        {/* Action row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button onClick={onCreateTable}>
              <PlusIcon className="size-4" />
              Nueva Mesa
            </Button>
            {canUndo && (
              <Button plain onClick={onUndo}>
                <ArrowUturnLeftIcon className="size-4" />
                <span className="hidden sm:inline">Deshacer</span>
              </Button>
            )}
            {canAutoAssign && (
              <Button plain onClick={onAutoAssign} title="Asignar invitados sin mesa automáticamente">
                <SparklesIcon className="size-4" />
                <span className="hidden sm:inline">Auto-asignar</span>
              </Button>
            )}
            <Button plain onClick={onPrint} title="Imprimir plan de mesas">
              <PrinterIcon className="size-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          </div>

          {pendingCount > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <Button plain onClick={onDiscard}>Descartar</Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Guardando…' : `Guardar cambios (${pendingCount})`}
              </Button>
            </div>
          )}
        </div>

        {/* Stats row */}
        {tableCount > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5">
              <span className="text-zinc-500">Mesas </span>
              <span className="font-bold text-zinc-200">{tableCount}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5">
              <span className="text-zinc-500">Capacidad </span>
              <span className="font-bold text-zinc-200">{totalCapacity}</span>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
              <span className="text-emerald-400">Sentados </span>
              <span className="font-bold text-emerald-300">{totalSeated}</span>
            </div>
            {unassignedCount > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                <span className="text-amber-400">Sin mesa </span>
                <span className="font-bold text-amber-300">{unassignedCount}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile sticky save bar */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between md:hidden print:hidden"
          >
            <span className="text-xs text-zinc-400">
              {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
            </span>
            <div className="flex items-center gap-2">
              <Button plain onClick={onDiscard} className="text-xs">Descartar</Button>
              <Button onClick={onSave} disabled={saving} className="text-xs">
                {saving ? '…' : 'Guardar'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
