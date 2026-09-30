'use client'

import * as Headless from '@headlessui/react'
import { useRef, type ReactNode } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const closeRequestedRef = useRef(false)
  const wasOpenRef = useRef(isOpen)

  if (isOpen && !wasOpenRef.current) closeRequestedRef.current = false
  wasOpenRef.current = isOpen

  const requestClose = () => {
    if (closeRequestedRef.current) return
    closeRequestedRef.current = true
    onClose()
  }

  return (
    <Headless.Dialog open={isOpen} onClose={requestClose} className="relative z-50" aria-label={title ?? 'Acciones'}>
      <Headless.DialogBackdrop
        transition
        data-testid="bottom-sheet-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none data-closed:opacity-0 data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex items-end">
        <Headless.DialogPanel
          transition
          className="pointer-events-auto w-full rounded-t-[1.75rem] border-t border-[var(--app-border-subtle)] bg-[var(--app-surface-raised)] shadow-[0_-16px_48px_var(--app-shadow-strong)] will-change-[opacity,transform] transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:data-closed:translate-y-0 motion-reduce:data-closed:opacity-100 data-closed:translate-y-full data-closed:opacity-0 data-leave:duration-150 data-leave:ease-in"
        >
          <div aria-hidden="true" className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-10 rounded-full bg-[var(--app-border-strong)]" />
          </div>
          {title && (
            <Headless.DialogTitle className="border-b border-[var(--app-border-subtle)] px-5 py-3 text-sm font-semibold text-[var(--app-text-primary)]">
              {title}
            </Headless.DialogTitle>
          )}
          <div className="max-h-[min(70dvh,36rem)] overflow-y-auto overscroll-contain px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
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
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) motion-reduce:transition-none disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-rose-500 hover:bg-rose-500/10'
          : 'text-ink hover:bg-surface-interactive'
      }`}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  )
}
