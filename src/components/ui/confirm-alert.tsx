'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { ArrowPathIcon } from '@heroicons/react/16/solid'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Right after opening, ignore dismiss and confirm for the OS double-click interval (Windows default 500 ms):
 * the second click of a double click on the trigger lands on the dialog backdrop (Headless UI closes on
 * outside click) or on a button that now sits where the trigger was.
 */
export const CONFIRM_ALERT_OPEN_GUARD_MS = 500

interface ConfirmAlertProps {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  tone?: 'danger' | 'primary'
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export function ConfirmAlert({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  busy = false,
  tone = 'danger',
  onClose,
  onConfirm,
}: ConfirmAlertProps) {
  const confirmingRef = useRef(false)
  const openedAtRef = useRef(0)

  useLayoutEffect(() => {
    if (open) openedAtRef.current = Date.now()
  }, [open])

  const justOpened = () => Date.now() - openedAtRef.current < CONFIRM_ALERT_OPEN_GUARD_MS

  const close = () => {
    if (!busy && !confirmingRef.current && !justOpened()) onClose()
  }

  return (
    <Alert open={open} onClose={close} role="alertdialog">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertActions>
        <Button type="button" plain disabled={busy} onClick={close}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          color={tone === 'danger' ? 'red' : 'indigo'}
          disabled={busy}
          onClickCapture={() => {
            confirmingRef.current = true
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!justOpened()) void onConfirm()
            queueMicrotask(() => {
              confirmingRef.current = false
            })
          }}
        >
          {busy && <ArrowPathIcon data-slot="icon" aria-hidden="true" className="animate-spin" />}
          {busy ? 'Procesando…' : confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
