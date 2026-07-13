'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { ArrowPathIcon } from '@heroicons/react/16/solid'
import { useEffect, useRef, type ReactNode } from 'react'

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
  const openingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    openingRef.current = true
    queueMicrotask(() => {
      openingRef.current = false
    })
  }, [open])

  const close = () => {
    if (!busy && !confirmingRef.current && !openingRef.current) onClose()
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
            void onConfirm()
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
