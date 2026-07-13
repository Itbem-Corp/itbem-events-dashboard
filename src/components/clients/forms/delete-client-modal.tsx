'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { clientPath } from '@/lib/api-paths'
import type { Client } from '@/models/Client'
import { useState } from 'react'
import { toast } from 'sonner'

interface DeleteClientModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  client: Client | null
  onOptimisticDelete?: (client: Client) => Promise<void> | void
  onDeleteRollback?: (client: Client) => Promise<void> | void
  onDeleted?: () => void
}

export function DeleteClientModal({
  isOpen,
  setIsOpen,
  client,
  onOptimisticDelete,
  onDeleteRollback,
  onDeleted,
}: DeleteClientModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!client?.id) return

    setIsDeleting(true)
    try {
      await onOptimisticDelete?.(client)
      await api.delete(clientPath(client.id))
      setIsOpen(false)
      onDeleted?.()
      toast.success('Cliente eliminado')
    } catch (err: unknown) {
      await onDeleteRollback?.(client)
      toast.error(getApiErrorMessage(err, 'Error al eliminar el cliente'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Alert open={isOpen} onClose={(open) => !isDeleting && setIsOpen(open)}>
      <AlertTitle>¿Confirmar eliminación?</AlertTitle>
      <AlertDescription>
        Estás a punto de eliminar a <strong>{client?.name}</strong>. Esta acción no se puede deshacer y afectará a todos
        los miembros asociados.
      </AlertDescription>
      <AlertActions>
        <Button type="button" plain onClick={() => setIsOpen(false)} disabled={isDeleting}>
          Cancelar
        </Button>
        <Button
          type="button"
          color="red"
          onClick={handleDelete}
          disabled={isDeleting}
          data-testid="confirm-delete-client"
        >
          {isDeleting ? 'Eliminando...' : 'Eliminar'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
