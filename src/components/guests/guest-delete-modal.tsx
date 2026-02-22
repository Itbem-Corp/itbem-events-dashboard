'use client'

import { useState } from 'react'
import { mutate } from 'swr'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'

import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Guest } from '@/models/Guest'

interface Props {
  guest: Guest | null
  eventIdentifier: string
  onClose: () => void
}

export function GuestDeleteModal({ guest, eventIdentifier, onClose }: Props) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!guest) return
    setLoading(true)
    try {
      await api.delete(`/guests/${guest.id}`)
      await mutate(`/guests/${eventIdentifier}`)
      onClose()
      toast.success('Invitado eliminado')
    } catch {
      toast.error('Error al eliminar el invitado')
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
