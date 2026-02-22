'use client'

import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, ArrowUturnLeftIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/button'

interface SeatingToolbarProps {
  pendingCount: number
  canUndo: boolean
  saving: boolean
  onCreateTable: () => void
  onSave: () => void
  onDiscard: () => void
  onUndo: () => void
}

export function SeatingToolbar({
  pendingCount,
  canUndo,
  saving,
  onCreateTable,
  onSave,
  onDiscard,
  onUndo,
}: SeatingToolbarProps) {
  return (
    <>
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

      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between md:hidden"
          >
            <span className="text-xs text-zinc-400">
              {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
            </span>
            <div className="flex items-center gap-2">
              <Button plain onClick={onDiscard} className="text-xs">
                Descartar
              </Button>
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
