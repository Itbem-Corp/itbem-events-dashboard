'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { userPath } from '@/lib/api-paths'
import { useState } from 'react'
import { toast } from 'sonner'
import type { AdminUserListItemResponse } from '@/models/User'

type DeletableUser = AdminUserListItemResponse

interface DeleteUserModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  user: DeletableUser | null
  onOptimisticDelete?: (user: DeletableUser) => Promise<void> | void
  onDeleteRollback?: (user: DeletableUser) => Promise<void> | void
  onDeleted?: () => void
}

export function DeleteUserModal({
  isOpen,
  setIsOpen,
  user,
  onOptimisticDelete,
  onDeleteRollback,
  onDeleted,
}: DeleteUserModalProps) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!user?.id) return
    setLoading(true)

    try {
      await onOptimisticDelete?.(user)
      await api.delete(userPath(user.id))
      setIsOpen(false)
      onDeleted?.()
      toast.success('Usuario eliminado')
    } catch (err: unknown) {
      await onDeleteRollback?.(user)
      toast.error(getApiErrorMessage(err, 'Error al eliminar usuario'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Alert open={isOpen} onClose={(open) => !loading && setIsOpen(open)}>
      <AlertTitle>¿Eliminar usuario?</AlertTitle>
      <AlertDescription>
        <span className="block">Eliminarás permanentemente a <strong>{user?.email}</strong>.</span>
        <span className="mt-2 block text-ink-secondary">
          Se retirará de sus organizaciones y no podrá iniciar sesión. Esta acción no se puede deshacer.
        </span>
      </AlertDescription>

      <AlertActions>
        <Button type="button" plain onClick={() => setIsOpen(false)} disabled={loading}>
          Cancelar
        </Button>
        <Button type="button" color="red" onClick={handleDelete} disabled={loading} data-testid="confirm-delete-user">
          {loading ? 'Eliminando…' : 'Eliminar'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
