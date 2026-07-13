'use client'

import { ConfirmAlert } from '@/components/ui/confirm-alert'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventPath } from '@/lib/api-paths'
import type { Event } from '@/models/Event'
import { useState } from 'react'
import { toast } from 'sonner'

interface EventDeleteModalProps {
  event: Event
  open: boolean
  onClose: () => void
  onDeleted?: () => void
  onOptimisticDelete?: (event: Event) => Promise<void> | void
  onDeleteRollback?: (event: Event) => Promise<void> | void
  onRevalidate?: () => void
}

export function EventDeleteModal({
  event,
  open,
  onClose,
  onDeleted,
  onOptimisticDelete,
  onDeleteRollback,
  onRevalidate,
}: EventDeleteModalProps) {
  const [deleting, setDeleting] = useState(false)

  async function deleteEvent() {
    if (deleting) return
    setDeleting(true)
    try {
      await onOptimisticDelete?.(event)
      await api.delete(eventPath(event.id))
      onRevalidate?.()
      toast.success(`"${event.name}" fue eliminado`)
      onDeleted?.()
      onClose()
    } catch (error) {
      await onDeleteRollback?.(event)
      toast.error(getApiErrorMessage(error, 'No se pudo eliminar el evento'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ConfirmAlert
      open={open}
      title="¿Eliminar evento?"
      description={
        <>
          <strong>{event.name}</strong> se retirará del dashboard y dejará de estar disponible públicamente. Esta acción
          no se puede deshacer desde esta interfaz.
        </>
      }
      confirmLabel="Eliminar evento"
      busy={deleting}
      onClose={onClose}
      onConfirm={deleteEvent}
    />
  )
}
