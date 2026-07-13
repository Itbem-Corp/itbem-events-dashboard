'use client'

import { useState } from 'react'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'

import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { guestPath } from '@/lib/api-paths'
import type { Guest } from '@/models/Guest'
import { toast } from 'sonner'

interface Props {
  guest: Guest | null
  eventIdentifier: string
  eventId?: string
  onClose: () => void
  onPublicContentChanged?: () => void
  onOptimisticDelete?: (guest: Guest) => Promise<void> | void
  onDeleteRollback?: (guest: Guest) => Promise<void> | void
  onRevalidate?: () => void
}

export function GuestDeleteModal({
  guest,
  eventIdentifier,
  eventId,
  onClose,
  onPublicContentChanged,
  onOptimisticDelete,
  onDeleteRollback,
  onRevalidate,
}: Props) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!guest) return
    setLoading(true)
    try {
      await onOptimisticDelete?.(guest)
      await api.delete(guestPath(guest.id))
      onRevalidate?.()
      onPublicContentChanged?.()
      onClose()
      toast.success('Invitado eliminado')
    } catch (err: unknown) {
      await onDeleteRollback?.(guest)
      toast.error(getApiErrorMessage(err, 'Error al eliminar el invitado'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Alert open={Boolean(guest)} onClose={onClose}>
      <AlertTitle>¿Eliminar invitado?</AlertTitle>
      <AlertDescription>
        Se eliminará a{' '}
        <strong className="text-zinc-200">
          {guest?.first_name} {guest?.last_name}
        </strong>{' '}
        y todos sus datos de forma permanente. Esta acción no se puede deshacer.
      </AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button color="red" onClick={handleDelete} disabled={loading}>
          {loading ? 'Eliminando…' : 'Eliminar invitado'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
