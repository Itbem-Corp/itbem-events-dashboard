'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            data-testid="bottom-sheet-backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-zinc-900 border-t border-white/10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Acciones'}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {title && (
              <p className="px-4 py-2 text-sm font-semibold text-zinc-300 border-b border-white/5">
                {title}
              </p>
            )}
            <div className="px-2 py-2 max-h-[70vh] overflow-y-auto pb-safe">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Reusable row item for inside a BottomSheet
interface SheetRowProps {
  icon: ReactNode
  label: string
  onClick: () => void
  trailing?: ReactNode
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export function SheetRow({ icon, label, onClick, trailing, variant = 'default', disabled }: SheetRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-zinc-200 hover:bg-white/5'
      }`}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  )
}
