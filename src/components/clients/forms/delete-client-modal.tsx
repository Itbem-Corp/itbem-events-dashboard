'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { mutate } from 'swr'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Client } from '@/models/Client'

interface DeleteClientModalProps {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    client: Client | null
}

export function DeleteClientModal({ isOpen, setIsOpen, client }: DeleteClientModalProps) {
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        if (!client?.id) return

        setIsDeleting(true)
        try {
            await api.delete(`/clients/${client.id}`)
            await mutate('/clients')
            setIsOpen(false)
            toast.success('Cliente eliminado')
        } catch {
            toast.error('Error al eliminar el cliente')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Alert open={isOpen} onClose={setIsOpen}>
            <AlertTitle>¿Confirmar eliminación?</AlertTitle>
            <AlertDescription>
                Estás a punto de eliminar a <strong>{client?.name}</strong>. Esta acción no se puede deshacer y afectará a todos los miembros asociados.
            </AlertDescription>
            <AlertActions>
                <Button plain onClick={() => setIsOpen(false)}>
                    Cancelar
                </Button>
                <Button color="red" onClick={handleDelete} disabled={isDeleting} data-testid="confirm-delete-client">
                    {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </Button>
            </AlertActions>
        </Alert>
    )
}
