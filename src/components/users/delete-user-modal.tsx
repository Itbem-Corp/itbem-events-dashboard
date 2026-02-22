'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { mutate } from 'swr'
import { useState } from 'react'
import { toast } from 'sonner'
import type { User } from '@/models/User'

interface DeleteUserModalProps {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    user: User | null
}

export function DeleteUserModal({ isOpen, setIsOpen, user }: DeleteUserModalProps) {
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        if (!user?.id) return
        setLoading(true)

        try {
            await api.delete(`/users/${user.id}`)
            await mutate('/users/all')
            setIsOpen(false)
            toast.success('Usuario eliminado')
        } catch {
            toast.error('Error al eliminar usuario')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Alert open={isOpen} onClose={setIsOpen}>
            <AlertTitle>¿Eliminar usuario?</AlertTitle>
            <AlertDescription>
                Esta acción eliminará permanentemente a <strong>{user?.email}</strong>.
            </AlertDescription>

            <AlertActions>
                <Button plain onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button color="red" onClick={handleDelete} disabled={loading} data-testid="confirm-delete-user">
                    {loading ? 'Eliminando…' : 'Eliminar'}
                </Button>
            </AlertActions>
        </Alert>
    )
}
